import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";

export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
}

export interface ConversationTag {
  id: string;
  conversation_id: string;
  tag_id: string;
  created_at: string;
}

export function useTags() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags", uids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags" as any)
        .select("*")
        .in("user_id", uids)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Tag[];
    },
    enabled: !!user && orgReady,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const { data: conversationTags = [] } = useQuery({
    queryKey: ["conversation_tags", uids],
    queryFn: async () => {
      // Fetch all conversation_tags for conversations belonging to org users
      const { data: convIds } = await supabase
        .from("conversations")
        .select("id")
        .in("user_id", uids);
      if (!convIds || convIds.length === 0) return [];
      const ids = convIds.map(c => c.id);
      // Fetch in batches if needed
      const allTags: ConversationTag[] = [];
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("conversation_tags" as any)
          .select("*")
          .in("conversation_id", batch);
        if (error) throw error;
        if (data) allTags.push(...(data as unknown as ConversationTag[]));
      }
      return allTags;
    },
    enabled: !!user && orgReady,
    staleTime: 2 * 60_000,
    refetchOnMount: true,
  });

  const createTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase
        .from("tags" as any)
        .insert({ name, color, user_id: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase
        .from("tags" as any)
        .update({ name, color } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tags" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["conversation_tags"] });
    },
  });

  const assignTag = useMutation({
    mutationFn: async ({ conversationId, tagId }: { conversationId: string; tagId: string }) => {
      const { error } = await supabase
        .from("conversation_tags" as any)
        .insert({ conversation_id: conversationId, tag_id: tagId } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation_tags"] }),
  });

  const removeTag = useMutation({
    mutationFn: async ({ conversationId, tagId }: { conversationId: string; tagId: string }) => {
      const { error } = await supabase
        .from("conversation_tags" as any)
        .delete()
        .eq("conversation_id", conversationId)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation_tags"] }),
  });

  const getTagsForConversation = (conversationId: string) => {
    const tagIds = conversationTags
      .filter(ct => ct.conversation_id === conversationId)
      .map(ct => ct.tag_id);
    return tags.filter(t => tagIds.includes(t.id));
  };

  const getConversationIdsForTag = (tagId: string) => {
    return conversationTags
      .filter(ct => ct.tag_id === tagId)
      .map(ct => ct.conversation_id);
  };

  return {
    tags,
    conversationTags,
    isLoading,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    removeTag,
    getTagsForConversation,
    getConversationIdsForTag,
  };
}
