import { useState } from "react";
import { Check, Loader2, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../components/ui/dialog";
import { Event } from "../../../types";

interface EventCommunityActionsProps {
  chatAvailable: boolean;
  canViewMedia: boolean;
  canPostMedia: boolean;
  timeRange?: string;
  eventStatus?: "upcoming" | "active" | "ended";
  event?: Event;
}

export function EventCommunityActions({
  chatAvailable,
  canViewMedia,
  canPostMedia,
  timeRange,
  eventStatus = "active",
  event,
}: EventCommunityActionsProps) {
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSuccess, setChatSuccess] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSuccess, setMediaSuccess] = useState(false);
  const [postMediaOpen, setPostMediaOpen] = useState(false);
  const [postMediaLoading, setPostMediaLoading] = useState(false);
  const [postMediaSuccess, setPostMediaSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [mediaLimitMessage, setMediaLimitMessage] = useState("");
  const MAX_MEDIA = 5;

  const handleChatClick = async () => {
    if (!chatAvailable || chatLoading) return;
    setChatLoading(true);
    setChatSuccess(false);

    // Simula abertura do chat
    await new Promise((resolve) => setTimeout(resolve, 800));

    setChatLoading(false);
    setChatSuccess(true);
    setTimeout(() => setChatSuccess(false), 2000);
  };

  const handleViewMediaClick = async () => {
    if (!canViewMedia || mediaLoading) return;
    setMediaLoading(true);
    setMediaSuccess(false);

    // Simula visualização de mídias
    await new Promise((resolve) => setTimeout(resolve, 600));

    setMediaLoading(false);
    setMediaSuccess(true);
    setTimeout(() => setMediaSuccess(false), 2000);
  };

  const handlePostMediaClick = () => {
    if (!canPostMedia) return;
    setPostMediaOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const limitedFiles = files.slice(0, MAX_MEDIA);
    if (files.length > MAX_MEDIA) {
      setMediaLimitMessage(`Limite de ${MAX_MEDIA} mídias por evento.`);
    } else {
      setMediaLimitMessage("");
    }

    setSelectedFiles(limitedFiles);

    // Cria previews
    const urls = limitedFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
  };

  const handlePostMedia = async () => {
    if (selectedFiles.length === 0) return;

    setPostMediaLoading(true);
    setPostMediaSuccess(false);

    // Simula publicação das fotos
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setPostMediaLoading(false);
    setPostMediaSuccess(true);

    // Limpa seleção após sucesso
    setTimeout(() => {
      setPostMediaOpen(false);
      setSelectedFiles([]);
      setPreviewUrls([]);
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPostMediaSuccess(false);
    }, 1500);
  };

  const handleCloseMediaDialog = () => {
    if (postMediaLoading) return;
    setPostMediaOpen(false);
    setSelectedFiles([]);
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPreviewUrls([]);
  };

  return (
    <>
      <div className="border-t border-border pt-3">
        <p className="text-[11px] text-muted-foreground mb-2">
          Chat fica disponível ao entrar no evento. Mídias podem ser vistas após
          o evento.
          {timeRange
            ? ` Publicação somente dentro do horário (${timeRange}).`
            : ""}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleChatClick}
            className={`flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              chatSuccess ? "bg-green-500/20 border-green-500" : ""
            }`}
            disabled={!chatAvailable || chatLoading}
            type="button"
          >
            {chatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : chatSuccess ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : null}
            <span>Abrir chat</span>
          </button>
          <button
            onClick={handleViewMediaClick}
            className={`flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              mediaSuccess ? "bg-green-500/20 border-green-500" : ""
            }`}
            disabled={!canViewMedia || mediaLoading}
            type="button"
          >
            {mediaLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mediaSuccess ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : null}
            <span>Ver mídias</span>
          </button>
          <button
            onClick={handlePostMediaClick}
            className={`flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              postMediaSuccess ? "bg-green-500" : ""
            }`}
            disabled={!canPostMedia}
            type="button"
          >
            {postMediaSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span>Publicar mídia</span>
          </button>
        </div>
      </div>

      {/* Modal para selecionar fotos da galeria */}
      <Dialog open={postMediaOpen} onOpenChange={handleCloseMediaDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar fotos do evento</DialogTitle>
            <DialogDescription>
              Escolha fotos da sua galeria para publicar no evento {event?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Input de arquivo */}
            <div>
              <label className="block">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="photo-input"
                />
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-accent transition-colors">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Selecione mídias da galeria
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clique aqui ou arraste imagens e vídeos (máx. {MAX_MEDIA})
                  </p>
                </div>
              </label>
            </div>

            {/* Preview das mídias selecionadas */}
            {previewUrls.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Mídias selecionadas ({previewUrls.length}/{MAX_MEDIA})
                </p>
                {mediaLimitMessage && (
                  <p className="text-xs text-destructive mb-2">
                    {mediaLimitMessage}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                  {previewUrls.map((url, index) => {
                    const fileType = selectedFiles[index]?.type ?? "";
                    const isVideo = fileType.startsWith("video/");
                    return (
                      <div
                        key={index}
                        className="relative aspect-square rounded-lg overflow-hidden"
                      >
                        {isVideo ? (
                          <video
                            src={url}
                            className="w-full h-full object-cover"
                            controls
                          />
                        ) : (
                          <img
                            src={url}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <button
                          onClick={() => {
                            const newUrls = previewUrls.filter(
                              (_, i) => i !== index,
                            );
                            const newFiles = selectedFiles.filter(
                              (_, i) => i !== index,
                            );
                            URL.revokeObjectURL(url);
                            setPreviewUrls(newUrls);
                            setSelectedFiles(newFiles);
                            setMediaLimitMessage("");
                          }}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80"
                          type="button"
                        >
                          <span className="text-xs">×</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botão de publicar */}
            <button
              onClick={handlePostMedia}
              disabled={selectedFiles.length === 0 || postMediaLoading}
              className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                postMediaSuccess
                  ? "bg-green-500 text-white"
                  : "bg-primary text-primary-foreground"
              }`}
              type="button"
            >
              {postMediaLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publicando...</span>
                </>
              ) : postMediaSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Publicado com sucesso!</span>
                </>
              ) : (
                <span>
                  Publicar{" "}
                  {selectedFiles.length > 0 &&
                    `${selectedFiles.length} mídia${selectedFiles.length > 1 ? "s" : ""}`}
                </span>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
