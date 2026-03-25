/**
 * Hook for managing a confirmation dialog without native `window.confirm()`.
 *
 * Returns a `requestConfirm` function to trigger the dialog and a `confirmDialog`
 * React element to render in the component tree.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog, type ConfirmDialogProps } from "../components/confirm-dialog";

type ConfirmRequest = Pick<ConfirmDialogProps, "title" | "description" | "confirmLabel" | "cancelLabel" | "variant"> & {
  onConfirm: () => void;
};

export const useConfirmDialog = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const requestConfirm = useCallback((req: ConfirmRequest) => {
    setRequest(req);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) setRequest(null);
  }, []);

  const confirmDialog = request ? (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      variant={request.variant}
      onConfirm={request.onConfirm}
    />
  ) : null;

  return { requestConfirm, confirmDialog } as const;
};
