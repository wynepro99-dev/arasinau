import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { updateUser } from '../lib/storage';
import { X, Lock, Camera, Trash2, CheckCircle2, User as UserIcon } from 'lucide-react';

interface ProfileSettingsModalProps {
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onUpdateCurrentUser: (user: User) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onUpdateCurrentUser,
  onToast
}) => {
  const [avatar, setAvatar] = useState<string>(currentUser.avatar || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAvatar(currentUser.avatar || '');
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, currentUser.avatar]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // We will resize the image automatically to keep the database lightweight
    if (file.size > 5 * 1024 * 1024) {
      onToast('Ukuran foto awal terlalu besar (maksimal 5MB).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas to resize image
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw and compress (0.8 quality webp)
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/webp', 0.8);
          setAvatar(compressedBase64);
          onToast('Foto profil berhasil diproses! Jangan lupa klik Simpan.', 'info');
        }
      };
      img.onerror = () => {
        onToast('Gagal memproses gambar.', 'error');
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatar('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onToast('Foto profil dihapus. Simpan untuk menerapkan.', 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password && password !== confirmPassword) {
      onToast('Konfirmasi kata sandi baru tidak cocok.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const updates: Partial<User> = {
        avatar: avatar || undefined
      };

      if (password) {
        updates.password = password.trim();
      }

      const updated = await updateUser(currentUser.id, updates);
      onUpdateCurrentUser(updated);
      onToast('Pengaturan profil berhasil diperbarui!', 'success');
      setPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err: any) {
      onToast(err.message || 'Gagal memperbarui profil', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-100 flex flex-col animate-scale-in">
          
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-100 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Pengaturan Akun & Profil</h2>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500">Sesuaikan foto profil dan kata sandi Anda</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            
            {/* Avatar Upload Section */}
            <div className="shrink-0 flex flex-col items-center space-y-3 pb-4 border-b border-slate-100 dark:border-zinc-850">
              <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 self-start">Foto Profil</label>
              
              <div className="relative group">
                {avatar ? (
                  <img
                    src={avatar}
                    alt="Avatar Preview"
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-200 dark:border-zinc-700 shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-indigo-50 dark:bg-zinc-800 border-2 border-dashed border-indigo-200 dark:border-zinc-700 flex items-center justify-center text-indigo-500 dark:text-zinc-400 shadow-sm">
                    <UserIcon className="w-10 h-10" />
                  </div>
                )}
                
                <label
                  htmlFor="avatar-upload"
                  className="absolute -bottom-2 -right-2 p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 hover:scale-105 transition-all active:scale-95 cursor-pointer"
                  title="Pilih Foto Baru"
                >
                  <Camera className="w-4 h-4" />
                </label>
              </div>

              <input
                id="avatar-upload"
                type="file"
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              <div className="flex items-center space-x-2 text-[10px]">
                <label
                  htmlFor="avatar-upload"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
                >
                  Pilih Berkas Foto
                </label>
                {avatar && (
                  <>
                    <span className="text-slate-300 dark:text-zinc-700">•</span>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="text-rose-600 dark:text-rose-400 hover:underline font-bold flex items-center space-x-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus Foto</span>
                    </button>
                  </>
                )}
              </div>
              <p className="text-[9px] text-slate-400 dark:text-zinc-500 text-center">Format file: JPG, PNG. Maksimal 2MB.</p>
            </div>

            {/* User Info Read-Only */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-zinc-950 p-3 rounded-2xl border border-slate-100 dark:border-zinc-850">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 block uppercase">Nama Personel</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-300">{currentUser.name}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 block uppercase">Instansi / Scope</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-300 uppercase">{currentUser.company || 'BANK'}</span>
              </div>
            </div>

            {/* Change Password Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Ganti Kata Sandi (Optional)</span>
              </h3>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1">Kata Sandi Baru</label>
                <input
                  type="password"
                  placeholder="Ketik kata sandi baru (minimal 6 karakter)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1">Konfirmasi Kata Sandi Baru</label>
                <input
                  type="password"
                  placeholder="Ulangi kata sandi baru Anda"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                  minLength={6}
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2 mt-4 active:scale-98"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>

          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
