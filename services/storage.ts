import { supabase } from '../lib/supabase';

const BUCKET = 'company-files';

export const uploadFile = async (
  companyId: string,
  path: string,
  file: File | Blob,
  contentType?: string
): Promise<string> => {
  const fullPath = `${companyId}/${path}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, file, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
};

export const uploadPdf = async (
  companyId: string,
  estimateId: string,
  pdfBlob: Blob
): Promise<string> => {
  return uploadFile(companyId, `pdfs/${estimateId}.pdf`, pdfBlob, 'application/pdf');
};

export const uploadPhoto = async (
  companyId: string,
  estimateId: string,
  file: File,
  fileName: string
): Promise<string> => {
  return uploadFile(companyId, `photos/${estimateId}/${fileName}`, file);
};

export const uploadLogo = async (companyId: string, file: File): Promise<string> => {
  return uploadFile(companyId, `logos/${file.name}`, file, file.type);
};

export const deleteFile = async (companyId: string, path: string): Promise<void> => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([`${companyId}/${path}`]);

  if (error) throw new Error(error.message);
};
