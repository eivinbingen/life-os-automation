"use client";

import { useEffect, useRef } from "react";

/** A native <dialog> opened as a modal, with one shared home for the
 * subtle close handling. Escape routes through onCancel + preventDefault
 * and never the browser's own close: the unmount cleanup calls close(),
 * which fires a close event, so an onClose handler on the element would
 * unmount the dialog right after it mounted — twice over under
 * StrictMode. jsdom does not fire the close event, so only manual
 * browser verification catches a regression here. */
export function ModalDialog({
  className,
  ariaLabel,
  ariaLabelledBy,
  closeDisabled = false,
  onClose,
  children,
}: {
  className: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  /** Blocks Escape while true; the visible close button must match. */
  closeDisabled?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
