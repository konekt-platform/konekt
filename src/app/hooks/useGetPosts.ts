import { useQuery } from "@tanstack/react-query";
import { getPostsRequest } from "../services/api/posts";
import { Post } from "../types";

export const useGetPosts = () => {
  return useQuery<Post[]>({
    queryKey: ["posts"],
    queryFn: getPostsRequest,
  });
};
