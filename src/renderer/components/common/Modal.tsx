import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusableElements = (container: HTMLElement): HTMLElement[] => (
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
);

/**
 * Modal — A base modal overlay component with correct close-on-backdrop behavior.
 *
 * Only closes when the user clicks the backdrop directly (mousedown + mouseup both on backdrop).
 * Dragging text from inside the modal to outside will NOT close the modal.
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  className,
  overlayClassName,
  onClick,
  ariaLabel,
  ariaLabelledBy,
  initialFocusRef,
  children,
}) => {
  const mouseDownOnBackdropRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const generatedTitleId = `modal-title-${useId().replace(/:/g, '')}`;
  const [inferredLabelledBy, setInferredLabelledBy] = useState<string | undefined>();

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (isOpen === false || ariaLabel || ariaLabelledBy) return;
    const heading = dialogRef.current?.querySelector<HTMLElement>('h1, h2, h3, [role="heading"]');
    if (!heading) return;
    if (!heading.id) heading.id = generatedTitleId;
    setInferredLabelledBy(heading.id);
  }, [ariaLabel, ariaLabelledBy, generatedTitleId, isOpen]);

  useEffect(() => {
    if (isOpen === false || typeof document === 'undefined') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const backgroundStates = Array.from(document.body.children)
      .filter((element) => element !== overlayRef.current)
      .map((element) => ({
        element: element as HTMLElement & { inert: boolean },
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: (element as HTMLElement & { inert: boolean }).inert,
      }));

    backgroundStates.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const focusTarget = initialFocusRef?.current
      ?? dialogRef.current?.querySelector<HTMLElement>('[autofocus], [data-modal-initial-focus]')
      ?? (dialogRef.current ? getFocusableElements(dialogRef.current)[0] : null)
      ?? dialogRef.current;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      backgroundStates.forEach(({ element, ariaHidden, inert }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialFocusRef, isOpen]);

  if (isOpen === false) return null;

  const modal = (
    <div
      ref={overlayRef}
      className={overlayClassName ?? 'fixed inset-0 z-50 flex items-center justify-center bg-black/50'}
      onMouseDown={(e) => {
        // Record whether mousedown started on the backdrop (not on modal content)
        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only close if both mousedown and click ended on the backdrop
        if (e.target === e.currentTarget && mouseDownOnBackdropRef.current) {
          mouseDownOnBackdropRef.current = false;
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (!ariaLabelledBy && !inferredLabelledBy ? 'Dialog' : undefined)}
        aria-labelledby={ariaLabelledBy ?? inferredLabelledBy}
        tabIndex={-1}
        className={className}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }

  return createPortal(modal, document.body);
};

export default Modal;
