import React, { useRef, useState } from 'react';
import { Loader2, Send, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  publishAdminNews,
  uploadAdminNewsImage,
} from '../../lib/appwriteClient';
import { useAuth } from '../AppwriteProvider';

type NewsFormState = {
  title: string;
  summary: string;
  imageUrl: string;
  content: string;
};

function formatNewsTitle(value: string) {
  const trimmed = value.trim().replace(/^new\s+update:\s*/i, '').trim();
  return trimmed ? `New Update: ${trimmed}` : '';
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [publishingNews, setPublishingNews] = useState(false);
  const [newsMessage, setNewsMessage] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsImageLabel, setNewsImageLabel] = useState<string | null>(null);
  const [newsImageLoading, setNewsImageLoading] = useState(false);
  const [newsImagePreview, setNewsImagePreview] = useState<string | null>(null);
  const [newsForm, setNewsForm] = useState<NewsFormState>({
    title: '',
    summary: '',
    imageUrl: '',
    content: '',
  });
  const newsImageInputRef = useRef<HTMLInputElement | null>(null);

  const resetNewsForm = () => {
    setNewsForm({
      title: '',
      summary: '',
      imageUrl: '',
      content: '',
    });
    setNewsImageLabel(null);
    setNewsImagePreview(null);
    if (newsImageInputRef.current) {
      newsImageInputRef.current.value = '';
    }
  };

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read the selected image.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });

  const resizeImageToBlob = (file: File, maxSize = 1400, quality = 0.82) => {
    return new Promise<Blob>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read the selected image.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Unable to load the selected image.'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Image editor is not supported in this browser.'));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Unable to prepare the selected image.'));
              return;
            }
            resolve(blob);
          }, 'image/jpeg', quality);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleNewsImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setNewsImageLoading(true);
    setNewsError(null);

    try {
      const optimizedImage = await resizeImageToBlob(file);
      if (!user) {
        throw new Error('You must be signed in to upload images.');
      }
      const uploadResult = await uploadAdminNewsImage({
        base64: await blobToBase64(optimizedImage),
        fileName: `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}.jpg`,
        mimeType: 'image/jpeg',
      });
      const downloadUrl = uploadResult.url;
      setNewsForm((prev) => ({ ...prev, imageUrl: downloadUrl }));
      setNewsImageLabel(file.name);
      setNewsImagePreview(URL.createObjectURL(optimizedImage));
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : 'Failed to process the selected image.');
    } finally {
      setNewsImageLoading(false);
    }
  };

  const handlePublishNews = async () => {
    setPublishingNews(true);
    setNewsMessage(null);
    setNewsError(null);

    try {
      if (!user) {
        throw new Error('You must be signed in to publish news.');
      }
      const title = formatNewsTitle(newsForm.title);
      const summary = newsForm.summary.trim();
      const content = newsForm.content.trim();
      const imageUrl = newsForm.imageUrl.trim();

      if (!title || !content) {
        throw new Error('Title and content are required.');
      }

      const payload = {
        title,
        summary,
        content,
        imageUrl,
        authorUid: user.$id,
        authorName: user.name || user.email || 'Admin',
      };

      const published = await publishAdminNews(payload);

      if (!published.notificationDispatch?.success) {
        const notificationError = published.notificationDispatch?.message || 'Unknown notification error';
        setNewsMessage(`News published successfully. Notification dispatch could not be completed: ${notificationError}`);
      } else {
        setNewsMessage('News published successfully and notification sent.');
      }

      resetNewsForm();
    } catch (error) {
      console.error('[News Studio] News publish failed:', error);
      setNewsError(error instanceof Error ? error.message : 'Failed to publish news');
    } finally {
      setPublishingNews(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#2D1B14] p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/20">
            <ShieldCheck className="h-6 w-6 text-brand-orange" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white">News Studio</h1>
            <p className="text-sm text-white/40">Publish a news update directly to Appwrite.</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/5 bg-[#4A2C21] p-6 shadow-2xl"
        >
          <div className="space-y-4">
            {newsMessage && (
              <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {newsMessage}
              </div>
            )}
            {newsError && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {newsError}
              </div>
            )}

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Title
              </label>
              <input
                value={newsForm.title}
                onChange={(e) => setNewsForm({ ...newsForm, title: e.target.value })}
                placeholder="News title"
                className="w-full rounded-2xl border border-white/5 bg-[#2D1B14] px-5 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Summary
              </label>
              <textarea
                value={newsForm.summary}
                onChange={(e) => setNewsForm({ ...newsForm, summary: e.target.value })}
                placeholder="Short summary shown on the news card"
                rows={3}
                className="w-full resize-none rounded-2xl border border-white/5 bg-[#2D1B14] px-5 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Image
              </label>
              <input
                ref={newsImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleNewsImageSelect}
                className="hidden"
              />
              <div className="space-y-3 rounded-2xl border border-white/5 bg-[#2D1B14] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">Upload a cover image</p>
                    <p className="text-xs text-white/40">JPG or PNG. The image is resized before publishing.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => newsImageInputRef.current?.click()}
                    disabled={newsImageLoading}
                    className="rounded-xl bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {newsImageLoading ? 'Processing...' : 'Choose File'}
                  </button>
                </div>

                {newsImageLabel && (
                  <div className="text-xs font-bold uppercase tracking-widest text-brand-orange">
                    Selected: {newsImageLabel}
                  </div>
                )}

                {newsImagePreview || newsForm.imageUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
                    <img
                      src={newsImagePreview || newsForm.imageUrl}
                      alt="News preview"
                      className="h-44 w-full object-cover"
                    />
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        Image preview
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewsForm((prev) => ({ ...prev, imageUrl: '' }));
                          setNewsImageLabel(null);
                          setNewsImagePreview(null);
                        }}
                        className="text-[10px] font-black uppercase tracking-widest text-brand-orange"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">
                    No image selected yet
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Content
              </label>
              <textarea
                value={newsForm.content}
                onChange={(e) => setNewsForm({ ...newsForm, content: e.target.value })}
                placeholder="Write the full news article here..."
                rows={10}
                className="w-full resize-none rounded-2xl border border-white/5 bg-[#2D1B14] px-5 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>

            <button
              onClick={handlePublishNews}
              disabled={publishingNews || !newsForm.title.trim() || !newsForm.content.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-orange py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-brand-orange-light disabled:opacity-50"
            >
              {publishingNews ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
              Publish News
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
