REVOKE ALL ON public.content_embeddings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_embeddings TO authenticated;
GRANT ALL ON public.content_embeddings TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_content(vector, text, text[], double precision, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.match_content(vector, text, text[], double precision, integer) TO authenticated, service_role;