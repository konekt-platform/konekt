import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
}

export function ShareDialog({
  open,
  onOpenChange,
  title,
  url,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground break-all">
            {url}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span>{copied ? "Link copiado" : "Copiar link"}</span>
          </button>
          <div className="flex flex-col items-center gap-2">
            <img
              src={qrUrl}
              alt="QR Code"
              className="h-40 w-40 rounded-lg border border-border"
            />
            <span className="text-xs text-muted-foreground">
              Compartilhar por QRCode
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
