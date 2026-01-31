import { Post } from '../../types';
import { apiFetch } from './client';
import { getMockPosts, addPost } from './mocks';

export const getPostsRequest = async (): Promise<Post[]> => {
  try {
    return await apiFetch<Post[]>('/posts');
  } catch {
    return getMockPosts();
  }
};

export const togglePostLikeRequest = async (postId: number) => {
  return apiFetch<{ likes: number; liked: boolean }>(`/posts/${postId}/like`, {
    method: 'POST',
  });
};

export const addPostCommentRequest = async (postId: number, text: string) => {
  return apiFetch<{
    comment: {
      id: number;
      userId: number;
      username: string;
      text: string;
      createdAt: string;
    };
    comments: number;
  }>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
};

export const createPostRequest = async (post: Post): Promise<Post> => {
  try {
    return await apiFetch<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify(post),
    });
  } catch {
    addPost(post);
    return post;
  }
};
