-- Create private storage bucket for company files
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', false);

-- RLS: users can read files under their company path
CREATE POLICY "company file read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );

-- RLS: admins can upload files under their company path
CREATE POLICY "admin file upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND public.get_my_role() = 'admin'
  );

-- RLS: crew can upload photos (site photos during job)
CREATE POLICY "crew photo upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (storage.foldername(name))[2] = 'photos'
    AND public.get_my_role() = 'crew'
  );

-- RLS: admins can delete their company files
CREATE POLICY "admin file delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND public.get_my_role() = 'admin'
  );
