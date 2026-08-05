# Design QA — 授权页密码可见性与错误提示

## Evidence

- Source visual truth: `C:/Users/QYF/AppData/Local/Temp/codex-clipboard-9dc6c8fe-ae65-4e07-af98-7112ab5b8de2.png`
- Implementation screenshot: Computer Use capture in the current task transcript; the runtime does not persist screenshot payloads to a filesystem path.
- Source pixels: 874 × 1114.
- Implementation capture: 1283 × 802 physical pixels at Windows device scale factor 1.5, approximately 855 × 535 CSS pixels.
- State: Windows, classic-light theme, signed-out registration form. The first password field was also captured after toggling visibility.

## Comparison

The full-view comparison preserved the source screen's card, field widths, label hierarchy, neutral palette, and vertical rhythm. The focused password-field comparison shows a standard eye control inside the right edge of both password inputs without reducing the text area. The error treatment keeps the existing pale red container but replaces the illegible pale text with medium-weight red text designed for both light and dark themes.

### Required fidelity surfaces

- Fonts and typography: existing Chinese typography, weights, and hierarchy remain unchanged; the error text gains `font-medium` for legibility.
- Spacing and layout rhythm: each eye button uses a 48px hit area inside the input and preserves the original input height, radius, and field spacing.
- Colors and visual tokens: light-theme errors use `bg-red-50` with `text-red-700`; dark-theme errors use `dark:bg-red-950/40` with `dark:text-red-300`.
- Image quality and asset fidelity: the supplied logo remains unchanged; eye and eye-slash controls use the repository's established Heroicons package rather than custom icon drawing.
- Copy and content: localized `显示密码` and `隐藏密码` labels are present in Chinese and English for accessible names and tooltips.

## Interaction evidence

- Login form: one visible eye button was present.
- Registration form: independent eye buttons were present for password and confirmation password.
- Visibility toggle: passed; clicking the first eye button changed the icon to eye-slash and the accessible label from `显示密码` to `隐藏密码`.
- Error contrast: the previous `text-red-100` class is removed; lint, production build, and a regression test verify the new light/dark semantic classes.

## Findings

No actionable P0, P1, or P2 differences remain for the two requested changes.

## Comparison history

- Initial state: password values could not be revealed, and the light-theme error message used near-white `text-red-100` on a pale red background.
- Fix: added independent password visibility controls and high-contrast semantic error colors.
- Post-fix evidence: both controls render without layout shift, the visibility state changes correctly, and the error class regression test passes.

## Follow-up polish

No P3 follow-up is required for this focused change.

final result: passed
