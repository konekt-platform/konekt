import { useEffect, useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  MapPin,
  Users,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Post } from "../../types";
import { ShareDialog } from "../../components/ShareDialog";
import { useAuth } from "../../contexts/AuthContext";
import {
  addPostCommentRequest,
  togglePostLikeRequest,
} from "../../services/api/posts";

interface PostCardProps {
  post: Post;
  // Descrição a ser exibida acima da foto:
  // - Para posts de amigos: legenda do usuário
  // - Para posts de eventos: descrição do evento
  description?: string;
  onUserClick?: (userId: number) => void;
}

export function PostCard({ post, description, onUserClick }: PostCardProps) {
  const { user: authUser } = useAuth();
  const attendees = post.attendees ?? [];
  const totalAttendees = post.totalAttendees ?? attendees.length;
  const media =
    post.images && post.images.length > 0 ? post.images : [post.image];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<
    Array<{ id: number; user: string; text: string; time: string }>
  >([]);
  const [commentsCount, setCommentsCount] = useState(post.comments ?? 0);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const liked = post.likedByIds?.includes(authUser?.id ?? -1) ?? false;
    setIsLiked(liked);
    setLikesCount(post.likes ?? 0);
    setCommentsCount(post.comments ?? 0);
    setCurrentImageIndex(0);
    const initialComments =
      post.commentsList?.map((comment) => ({
        id: comment.id,
        user: comment.username,
        text: comment.text,
        time: new Date(comment.createdAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })) ?? [];
    setComments(initialComments);
  }, [post, authUser?.id]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/post/${post.id}`
      : `post/${post.id}`;

  const handleLike = async () => {
    if (!authUser) return;
    const previousLiked = isLiked;
    const nextLiked = !previousLiked;
    setIsLiked(nextLiked);
    setLikesCount((count) => (nextLiked ? count + 1 : Math.max(count - 1, 0)));
    try {
      const result = await togglePostLikeRequest(post.id);
      setIsLiked(result.liked);
      setLikesCount(result.likes);
    } catch {
      // Mantém o estado local para não quebrar a interação offline
      setIsLiked(nextLiked);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() || !authUser) return;
    const text = commentText.trim();
    setCommentText("");
    try {
      const result = await addPostCommentRequest(post.id, text);
      const newComment = {
        id: result.comment.id,
        user: result.comment.username,
        text: result.comment.text,
        time: "agora",
      };
      setComments((prev) => [...prev, newComment]);
      setCommentsCount(result.comments);
    } catch {
      const newComment = {
        id: Date.now(),
        user: authUser.username ?? "Você",
        text,
        time: "agora",
      };
      setComments((prev) => [...prev, newComment]);
      setCommentsCount((count) => count + 1);
    }
  };

  return (
    <div className="bg-background border-b border-border">
      {/* Author Header (estilo Instagram/TikTok) - apenas para posts de usuário */}
      {post.author && !post.isEventPost && (
        <button
          type="button"
          onClick={() => onUserClick?.(post.author!.id)}
          className="w-full px-3 pt-3 pb-2 flex items-center gap-3 text-left"
        >
          {post.author.avatar ? (
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="w-9 h-9 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full border border-border bg-muted flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              @{post.author.username}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {post.event.name}
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground uppercase">
            {post.timeAgo}
          </span>
        </button>
      )}

      {/* Event Header - apenas para posts oficiais de eventos */}
      {(!post.author || post.isEventPost) && (
        <div className="px-3 py-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {post.event.name}
                </h3>
                <span className="text-[11px] text-muted-foreground uppercase">
                  {post.timeAgo}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{post.event.location}</span>
                <span>•</span>
                <span>{post.event.date}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendees - apenas para posts oficiais de eventos */}
      {(!post.author || post.isEventPost) && (
        <div className="px-3 pb-3">
          {attendees.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {attendees.slice(0, 4).map((attendee, index) =>
                  attendee.avatar ? (
                    <img
                      key={index}
                      src={attendee.avatar}
                      alt={attendee.name}
                      className="w-7 h-7 rounded-full border-2 border-background object-cover"
                      title={attendee.name}
                    />
                  ) : (
                    <div
                      key={index}
                      className="w-7 h-7 rounded-full border-2 border-background bg-muted flex items-center justify-center"
                      title={attendee.name}
                    >
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  ),
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">
                <span className="font-semibold">{attendees[0].name}</span>
                {attendees.length > 1 && (
                  <span>
                    {" e "}
                    <span className="font-semibold">
                      {Math.max(totalAttendees - 1, attendees.length - 1)}{" "}
                      {Math.max(totalAttendees - 1, attendees.length - 1) === 1
                        ? "pessoa"
                        : "pessoas"}
                    </span>
                  </span>
                )}
                {" participaram"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Descrição acima da foto */}
      {description && (
        <div className="px-3 pb-3">
          <p className="text-[13px] text-foreground leading-relaxed">
            {description}
          </p>
        </div>
      )}

      {/* Image */}
      <div className="relative w-full aspect-[4/5] bg-black">
        <img
          src={media[currentImageIndex]}
          alt={post.event.name}
          className="w-full h-full object-cover"
        />
        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrentImageIndex(
                  (prev) => (prev - 1 + media.length) % media.length,
                )
              }
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentImageIndex((prev) => (prev + 1) % media.length)
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {media.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentImageIndex
                      ? "w-6 bg-white"
                      : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 transition-colors ${
              isLiked
                ? "text-destructive"
                : "text-muted-foreground hover:text-destructive"
            }`}
            type="button"
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
            type="button"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          <button
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
            type="button"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button
            className="ml-auto flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
            type="button"
          >
            <Users className="w-4 h-4" />
            <span className="text-[12px] font-semibold">{totalAttendees}</span>
          </button>
        </div>

        <p className="text-[13px] text-foreground">
          <span className="font-semibold">{likesCount} curtidas</span>
        </p>

        {(commentsCount > 0 || comments.length > 0) && (
          <button
            onClick={() => setShowComments(!showComments)}
            className="text-[13px] text-muted-foreground mt-2 hover:text-foreground transition-colors"
            type="button"
          >
            Ver todos os {Math.max(commentsCount, comments.length)} comentários
          </button>
        )}

        {showComments && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2">
                <span className="text-[13px] font-semibold text-foreground">
                  {comment.user}:
                </span>
                <span className="text-[13px] text-foreground flex-1">
                  {comment.text}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {comment.time}
                </span>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComment();
                  }
                }}
                placeholder="Adicione um comentário..."
                className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim()}
                className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                type="button"
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Compartilhar post"
        url={shareUrl}
      />
    </div>
  );
}
