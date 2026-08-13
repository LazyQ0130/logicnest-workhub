// @vitest-environment jsdom

import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import Modal from './Modal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Harness: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        打开弹窗
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <h2>测试弹窗</h2>
        <button type="button">第一个操作</button>
        <button type="button">最后一个操作</button>
      </Modal>
    </>
  );
};

const NestedHarness: React.FC = () => {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuterOpen(true)}>open outer</button>
      <Modal isOpen={outerOpen} onClose={() => setOuterOpen(false)}>
        <h2>outer</h2>
        <button type="button" onClick={() => setInnerOpen(true)}>open inner</button>
        <button type="button">outer action</button>
      </Modal>
      <Modal isOpen={innerOpen} onClose={() => setInnerOpen(false)}>
        <h2>inner</h2>
        <button type="button" onClick={() => setInnerOpen(false)}>close inner</button>
        <button
          type="button"
          onClick={() => {
            setInnerOpen(false);
            setOuterOpen(false);
          }}
        >
          discard
        </button>
      </Modal>
    </>
  );
};

describe('Modal accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  const openModal = () => {
    act(() => root.render(<Harness />));
    const trigger = container.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());
    return trigger;
  };

  test('exposes dialog semantics, a title relationship, and moves focus inside', () => {
    openModal();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog?.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('测试弹窗');
    expect((document.activeElement as HTMLElement)?.textContent).toBe('第一个操作');
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect((container as HTMLDivElement & { inert: boolean }).inert).toBe(true);
  });

  test('cycles Tab and Shift+Tab inside the dialog', () => {
    openModal();
    const dialogButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
    const first = dialogButtons[0];
    const last = dialogButtons[dialogButtons.length - 1];

    last.focus();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(document.activeElement).toBe(first);

    first.focus();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(last);
  });

  test('closes on Escape and restores focus to the trigger', () => {
    const onClose = vi.fn();
    act(() => root.render(<Harness onClose={onClose} />));
    const trigger = container.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container.hasAttribute('aria-hidden')).toBe(false);
    expect((container as HTMLDivElement & { inert?: boolean }).inert).toBeFalsy();
  });

  test('keeps the outer modal interactive after closing a nested modal', () => {
    act(() => root.render(<NestedHarness />));
    const trigger = container.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());
    const outerButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find(button => button.textContent === 'open inner');
    expect(outerButton).toBeTruthy();
    act(() => outerButton?.click());

    const closeInner = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find(button => button.textContent === 'close inner');
    act(() => closeInner?.click());

    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('outer');
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect((container as HTMLDivElement & { inert: boolean }).inert).toBe(true);
    expect(document.activeElement?.textContent).toBe('open inner');

    act(() => outerButton?.click());
    const discardButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find(button => button.textContent?.trim() === 'discard');
    act(() => discardButton?.click());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.hasAttribute('aria-hidden')).toBe(false);
    expect((container as HTMLDivElement & { inert?: boolean }).inert).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
  });
});
