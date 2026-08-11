import React, { useState, useEffect } from 'react';
import { User, LearningModule } from '../../types';
import { getModules, addModule, deleteModule } from '../../lib/storage';
import { Trash2, BookOpen, Image as ImageIcon, FileText, X } from 'lucide-react';

interface ModulesDashboardProps {
  currentUser: User;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export function ModulesDashboard({ currentUser, onToast }: ModulesDashboardProps) {
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // File state (PDF/Document)
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  
  // Image Cover state
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');

  useEffect(() => {
    setModules(getModules());
  }, []);

  const canUpload = currentUser.role === 'admin' || currentUser.role === 'egi';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileUrl(event.target?.result as string);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !fileUrl) {
      onToast('Judul dan file wajib diisi.', 'error');
      return;
    }

    try {
      addModule({
        title,
        description,
        fileUrl,
        fileName: fileName || 'module_file',
        imageUrl: imageUrl || undefined,
        uploadedBy: currentUser.name
      });
      setModules(getModules());
      setIsUploading(false);
      
      // Reset
      setTitle('');
      setDescription('');
      setFileUrl('');
      setFileName('');
      setImageUrl('');
      setImageName('');
      
      onToast('Modul berhasil diunggah!', 'success');
    } catch (err: any) {
      onToast(err.message || 'Gagal mengunggah modul.', 'error');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus modul ini?')) {
      deleteModule(id);
      setModules(getModules());
      onToast('Modul berhasil dihapus', 'success');
    }
  };

  return (
    <div className="space-y-12 animate-fade-in text-slate-800 dark:text-zinc-200">
      
      {/* Editorial Header */}
      <section className="pt-6 sm:pt-10 flex flex-col items-center text-center space-y-4">
        <h1 className="font-extrabold text-4xl md:text-5xl lg:text-6xl text-slate-900 dark:text-white tracking-tight">
          Pusat Pembelajaran
        </h1>
        <p className="font-medium text-lg text-slate-500 dark:text-zinc-400 max-w-2xl">
          Cerita kami, pembaruan materi terbaru, dan wawasan eksklusif. Temukan apa saja yang ingin Anda pelajari tentang perusahaan.
        </p>
        
        {canUpload && (
          <div className="pt-6">
             <button
              onClick={() => setIsUploading(true)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-transform active:scale-95 shadow-md"
            >
              <FileText className="w-5 h-5" />
              Tulis & Unggah Modul Baru
            </button>
          </div>
        )}
      </section>

      {/* Upload Form (Modal Style Overlay) */}
      {isUploading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-zinc-800 relative">
            <button 
              onClick={() => setIsUploading(false)}
              className="absolute top-6 right-6 p-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-zinc-300" />
            </button>
            
            <h3 className="text-2xl font-extrabold mb-6 text-slate-900 dark:text-white">Tambah Materi Baru</h3>
            
            <form onSubmit={handleUpload} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">Judul Artikel / Modul</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ketik judul yang menarik..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors dark:text-white text-lg font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">File Dokumen Pembelajaran (PDF, dsb)</label>
                <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group">
                  <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" required />
                  <div className="flex flex-col items-center text-slate-500 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    <FileText className="w-8 h-8 mb-2" />
                    <span className="font-semibold text-sm">{fileName ? fileName : 'Pilih File Dokumen'}</span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">Gambar Sampul Depan (Cover)</label>
                <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group relative overflow-hidden">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  
                  {imageUrl ? (
                    <div className="absolute inset-0 w-full h-full">
                       <img src={imageUrl} alt="Preview" className="w-full h-full object-cover opacity-60" />
                       <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                         <span className="text-white font-bold px-4 py-2 rounded-full bg-black/50 backdrop-blur-md">Ganti Gambar</span>
                       </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-500 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <span className="font-semibold text-sm">Pilih Gambar Sampul (Opsional)</span>
                    </div>
                  )}
                </label>
                <p className="text-xs text-slate-500 mt-2">Disarankan rasio 16:9 (Landscape) agar tampil maksimal seperti portal berita.</p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
                <button
                  type="submit"
                  className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-lg"
                >
                  Terbitkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editorial Grid List (Gojek News Style) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-6 pb-20">
        {modules.map(mod => (
          <a 
            href={mod.fileUrl} 
            target="_blank" 
            rel="noreferrer" 
            key={mod.id} 
            className="flex flex-col gap-4 group cursor-pointer relative outline-none focus-visible:ring-4 focus-visible:ring-indigo-500 rounded-3xl"
          >
            {/* The Delete Button (Only for Admin) absolutely positioned */}
            {canUpload && (
              <button 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation();
                  handleDelete(mod.id); 
                }}
                className="absolute top-4 right-4 z-10 bg-rose-500 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-rose-600 hover:scale-110"
                title="Hapus Modul"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            <div className="overflow-hidden rounded-[24px] aspect-video w-full relative bg-slate-100 dark:bg-zinc-800/80 ring-1 ring-slate-200/50 dark:ring-zinc-800/50">
              {mod.imageUrl ? (
                <img 
                  src={mod.imageUrl} 
                  alt={mod.title} 
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" 
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center transition-transform duration-700 ease-out group-hover:scale-105">
                  <BookOpen className="w-16 h-16 text-slate-300 dark:text-zinc-700 drop-shadow-sm" />
                </div>
              )}
              {/* Optional: Reading tag overlay */}
              <div className="absolute top-4 left-4">
                 <span className="px-3 py-1 bg-white/90 dark:bg-black/70 backdrop-blur-md text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider rounded-full shadow-sm">
                   Bacaan
                 </span>
              </div>
            </div>
            
            <div className="flex flex-col justify-between h-full px-1">
              <h3 className="font-extrabold text-xl md:text-2xl text-slate-900 dark:text-white mb-2 leading-[1.3] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-3">
                {mod.title}
              </h3>
              <p className="font-bold text-xs md:text-sm text-slate-500 dark:text-zinc-400 uppercase tracking-wide mt-2">
                Oleh {mod.uploadedBy} <span className="mx-1.5">•</span> {new Date(mod.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric'})}
              </p>
            </div>
          </a>
        ))}

        {modules.length === 0 && !isUploading && (
          <div className="col-span-full py-20 text-center flex flex-col items-center justify-center">
             <div className="w-24 h-24 mb-6 rounded-3xl bg-slate-100 dark:bg-zinc-800/50 flex items-center justify-center ring-1 ring-slate-200 dark:ring-zinc-700">
               <FileText className="w-10 h-10 text-slate-400 dark:text-zinc-500" />
             </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">Belum Ada Materi</h3>
            <p className="text-slate-500 dark:text-zinc-400 max-w-md">Admin belum mempublikasikan materi atau modul pembelajaran terbaru saat ini.</p>
          </div>
        )}
      </section>
    </div>
  );
}
