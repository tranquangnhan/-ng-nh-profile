/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Settings, 
  X, 
  Image as ImageIcon,
  ExternalLink,
  Maximize2,
  LogIn,
  LogOut,
  Phone,
  Facebook,
  MessageCircle,
  Save,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  onSnapshot,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface Photo {
  id: string;
  url: string;
  isVertical?: boolean;
}

interface Album {
  id: string;
  title: string;
  coverUrl: string;
  folderUrl?: string;
  photos: Photo[];
  description?: string;
  createdAt?: Timestamp;
}

interface SiteSettings {
  logoUrl: string;
  facebook: string;
  phone: string;
  zalo: string;
  siteName: string;
  description: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  logoUrl: '',
  facebook: '',
  phone: '',
  zalo: '',
  siteName: 'VMEDIA',
  description: 'Ghi lại khoảnh khắc, tạo nên kỷ niệm.'
};

// --- Constants & Mock Data ---

const STORAGE_KEY = 'vmedia_portfolio_data';

const DEFAULT_ALBUMS: Album[] = [
  {
    id: '1',
    title: 'INDOOR STUDIO',
    coverUrl: 'https://picsum.photos/seed/studio1/800/1200',
    description: 'Minimalist studio session with elegant lighting.',
    photos: [
      { id: 'p1', url: 'https://picsum.photos/seed/studio1/800/1200', isVertical: true },
      { id: 'p2', url: 'https://picsum.photos/seed/studio2/1200/800', isVertical: false },
      { id: 'p3', url: 'https://picsum.photos/seed/studio3/800/1200', isVertical: true },
      { id: 'p4', url: 'https://picsum.photos/seed/studio4/1200/800', isVertical: false },
      { id: 'p5', url: 'https://picsum.photos/seed/studio5/800/1200', isVertical: true },
      { id: 'p6', url: 'https://picsum.photos/seed/studio6/1200/800', isVertical: false },
    ]
  },
  {
    id: '2',
    title: 'NGOẠI CẢNH SÀI GÒN',
    coverUrl: 'https://picsum.photos/seed/saigon1/1200/800',
    description: 'Capturing the vibrant energy of Saigon streets.',
    photos: [
      { id: 's1', url: 'https://picsum.photos/seed/saigon1/1200/800', isVertical: false },
      { id: 's2', url: 'https://picsum.photos/seed/saigon2/800/1200', isVertical: true },
      { id: 's3', url: 'https://picsum.photos/seed/saigon3/1200/800', isVertical: false },
    ]
  },
  {
    id: '3',
    title: 'SIGNATURE',
    coverUrl: 'https://picsum.photos/seed/sig1/800/1200',
    description: 'Our most iconic and artistic captures.',
    photos: [
      { id: 'sig1', url: 'https://picsum.photos/seed/sig1/800/1200', isVertical: true },
      { id: 'sig2', url: 'https://picsum.photos/seed/sig2/800/1200', isVertical: true },
      { id: 'sig3', url: 'https://picsum.photos/seed/sig3/1200/800', isVertical: false },
    ]
  }
];

// --- Helpers ---

/**
 * Converts a Google Drive sharing link to a direct download/view link.
 * Supports both file links and folder-based logic if needed.
 */
const getDriveDirectLink = (url: string) => {
  if (!url) return '';
  if (!url.includes('drive.google.com')) return url;
  
  const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/) || url.match(/id=([^\&]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://lh3.googleusercontent.com/u/0/d/${fileIdMatch[1]}=w1600`;
  }
  return url;
};

// --- Components ---

interface AlbumItemEditorProps {
  album: Album;
  onUpdate: (id: string, updates: Partial<Album>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onSync: (id: string, url: string) => Promise<void> | void;
  onBulkAdd: (id: string) => Promise<void> | void;
  onCleanBroken: (id: string) => Promise<void> | void;
  onToggleOrientation: (id: string, photoId: string) => Promise<void> | void;
  onDeletePhoto: (id: string, photoId: string) => Promise<void> | void;
  isSyncing: boolean;
}

const AlbumItemEditor: React.FC<AlbumItemEditorProps> = ({ 
  album, 
  onUpdate, 
  onDelete, 
  onSync, 
  onBulkAdd, 
  onCleanBroken, 
  onToggleOrientation, 
  onDeletePhoto,
  isSyncing 
}) => {
  const [localTitle, setLocalTitle] = useState(album.title);
  const [localDescription, setLocalDescription] = useState(album.description || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Update local state when album prop changes (e.g. from Firestore)
  // but only if the user is not currently typing
  useEffect(() => {
    setLocalTitle(album.title);
  }, [album.title]);

  useEffect(() => {
    setLocalDescription(album.description || '');
  }, [album.description]);

  return (
    <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-24 h-48 sm:h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
          <img src={album.coverUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 space-y-2">
              <input 
                type="text" 
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={() => onUpdate(album.id, { title: localTitle })}
                className="w-full bg-transparent text-lg font-bold border-b border-transparent focus:border-black outline-none transition-colors"
                placeholder="Tên Album"
              />
              <textarea 
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={() => onUpdate(album.id, { description: localDescription })}
                className="w-full bg-transparent text-xs text-black/60 border-b border-transparent focus:border-black outline-none transition-colors resize-none"
                placeholder="Mô tả album..."
                rows={2}
              />
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-black/40 block">Link ảnh bìa</label>
                <input 
                  type="text" 
                  value={album.coverUrl}
                  onChange={(e) => onUpdate(album.id, { coverUrl: getDriveDirectLink(e.target.value) })}
                  className="w-full bg-transparent text-[10px] border-b border-transparent focus:border-black outline-none transition-colors"
                  placeholder="Link ảnh trực tiếp hoặc Google Drive"
                />
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              {isConfirmingDelete ? (
                <div className="flex flex-col gap-1">
                  <button 
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onDelete(album.id);
                      setIsConfirmingDelete(false);
                    }}
                    className="bg-red-500 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  >
                    Xác nhận
                  </button>
                  <button 
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsConfirmingDelete(false);
                    }}
                    className="bg-gray-100 text-black px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button 
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Ngăn chặn mất focus đột ngột
                    setIsConfirmingDelete(true);
                  }}
                  className="p-3 text-red-500 hover:bg-red-50 active:bg-red-100 rounded-full transition-colors flex-shrink-0"
                  title="Xóa Album"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
            <label className="text-[10px] uppercase tracking-widest text-purple-400 font-bold block">Đồng bộ từ Thư mục Google Drive</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                value={album.folderUrl || ''}
                onChange={(e) => onUpdate(album.id, { folderUrl: e.target.value })}
                className="flex-1 bg-white px-3 py-2 text-xs rounded-lg border border-purple-200 outline-none focus:border-purple-500 transition-colors"
                placeholder="Dán link thư mục tại đây..."
              />
              <button 
                onClick={() => onSync(album.id, album.folderUrl || '')}
                disabled={isSyncing}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-purple-700 disabled:bg-purple-300 transition-colors whitespace-nowrap"
              >
                {isSyncing ? 'Đang quét...' : 'Đồng bộ ngay'}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-black/5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-black/40">Ảnh trong Album ({album.photos.length})</span>
              <div className="flex gap-4">
                <button 
                  onClick={() => onCleanBroken(album.id)}
                  className="text-xs font-bold uppercase tracking-widest text-orange-600 hover:underline"
                >
                  Dọn dẹp ảnh lỗi
                </button>
                <button 
                  onClick={() => onBulkAdd(album.id)}
                  className="text-xs font-bold uppercase tracking-widest text-green-600 hover:underline"
                >
                  + Thêm thủ công
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {album.photos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden group bg-gray-100">
                  <img 
                    src={photo.url} 
                    alt="" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      if (!(window as any)[`broken_${album.id}`]) {
                        (window as any)[`broken_${album.id}`] = new Set();
                      }
                      (window as any)[`broken_${album.id}`].add(photo.id);
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                    <button 
                      onClick={() => onUpdate(album.id, { coverUrl: photo.url })}
                      className={cn(
                        "w-full py-1 rounded text-[7px] font-bold uppercase transition-colors",
                        album.coverUrl === photo.url ? "bg-yellow-400 text-black" : "bg-white text-black hover:bg-yellow-200"
                      )}
                    >
                      {album.coverUrl === photo.url ? 'Ảnh bìa' : 'Làm bìa'}
                    </button>
                    <button 
                      onClick={() => onToggleOrientation(album.id, photo.id)}
                      className="w-full py-1 bg-white text-black rounded text-[7px] font-bold uppercase"
                    >
                      {photo.isVertical ? 'Dọc' : 'Ngang'}
                    </button>
                    <button 
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onDeletePhoto(album.id, photo.id);
                      }}
                      className="w-full py-1 bg-red-500 text-white rounded hover:bg-red-600 active:bg-red-700 transition-colors flex items-center justify-center"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SiteSettingsEditor: React.FC<{ 
  settings: SiteSettings; 
  onUpdate: (updates: Partial<SiteSettings>) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}> = ({ settings, onUpdate, onLogout, onLogoUpload }) => {
  const [localSiteName, setLocalSiteName] = useState(settings.siteName);
  const [localDescription, setLocalDescription] = useState(settings.description);

  useEffect(() => {
    setLocalSiteName(settings.siteName);
  }, [settings.siteName]);

  useEffect(() => {
    setLocalDescription(settings.description);
  }, [settings.description]);

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold uppercase tracking-widest text-black/40">Cấu hình Website</h4>
        <button 
          onClick={onLogout}
          className="flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:underline"
        >
          <LogOut size={14} /> Đăng xuất
        </button>
      </div>
      
      <div className="grid grid-cols-1 gap-6 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-black/5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative group">
            <div className="w-20 h-20 rounded-2xl bg-white border border-black/5 overflow-hidden">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-black/20">
                  <ImageIcon size={32} />
                </div>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity rounded-2xl">
              <Upload size={20} />
              <input type="file" className="hidden" accept="image/*" onChange={onLogoUpload} />
            </label>
          </div>
          <div className="flex-1 w-full space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Tên Website</label>
              <input 
                type="text" 
                value={localSiteName}
                onChange={(e) => setLocalSiteName(e.target.value)}
                onBlur={() => onUpdate({ siteName: localSiteName })}
                className="w-full bg-transparent border-b border-black/10 py-1 outline-none focus:border-black transition-colors font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Mô tả ngắn</label>
              <input 
                type="text" 
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={() => onUpdate({ description: localDescription })}
                className="w-full bg-transparent border-b border-black/10 py-1 outline-none focus:border-black transition-colors text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40 flex items-center gap-1">
              <Facebook size={10} /> Facebook
            </label>
            <input 
              type="text" 
              value={settings.facebook}
              onChange={(e) => onUpdate({ facebook: e.target.value })}
              className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-xs outline-none focus:border-black transition-colors"
              placeholder="Link Facebook"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40 flex items-center gap-1">
              <Phone size={10} /> Số điện thoại
            </label>
            <input 
              type="text" 
              value={settings.phone}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-xs outline-none focus:border-black transition-colors"
              placeholder="09xx xxx xxx"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40 flex items-center gap-1">
              <MessageCircle size={10} /> Zalo
            </label>
            <input 
              type="text" 
              value={settings.zalo}
              onChange={(e) => onUpdate({ zalo: e.target.value })}
              className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-xs outline-none focus:border-black transition-colors"
              placeholder="Số điện thoại Zalo"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Load data from Firebase
  useEffect(() => {
    // Auth state
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    // Albums state (sorted by createdAt descending)
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const unsubscribeAlbums = onSnapshot(q, 
      (snapshot) => {
        const albumData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Album[];
        setAlbums(albumData);
      },
      (error) => {
        console.error("Firestore snapshot error:", error);
        if (error.code === 'permission-denied') {
          setFirestoreError("Lỗi: Không có quyền truy cập dữ liệu. Hãy kiểm tra lại Security Rules trong Firebase Console.");
        } else {
          setFirestoreError("Lỗi kết nối dữ liệu: " + error.message);
        }
      }
    );

    // Site settings
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "main");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSiteSettings(docSnap.data() as SiteSettings);
        } else {
          // If we can't write, we'll just use defaults
          try {
            await setDoc(docRef, DEFAULT_SETTINGS);
          } catch (e) {
            console.warn("Could not create initial settings due to permissions.");
          }
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };
    fetchSettings();

    return () => {
      unsubscribeAuth();
      unsubscribeAlbums();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setLoginEmail('');
      setLoginPassword('');
    } catch (error: any) {
      alert('Đăng nhập thất bại: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleUpdateSettings = async (updates: Partial<SiteSettings>) => {
    if (!user) return;
    try {
      const newSettings = { ...siteSettings, ...updates };
      setSiteSettings(newSettings);
      await setDoc(doc(db, "settings", "main"), newSettings);
    } catch (error: any) {
      console.error("Error updating settings:", error);
    }
  };

  const selectedAlbum = useMemo(() => 
    albums.find(a => a.id === selectedAlbumId), 
    [albums, selectedAlbumId]
  );

  // --- Handlers ---

  const handleAddAlbum = async () => {
    if (!user) {
      alert('Bạn cần đăng nhập để thực hiện thao tác này.');
      return;
    }
    try {
      const newAlbum = {
        title: 'Album Mới',
        coverUrl: 'https://picsum.photos/seed/new/800/1200',
        photos: [],
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "albums"), newAlbum);
    } catch (error: any) {
      console.error("Error adding album:", error);
      alert('Không thể thêm album: ' + error.message + '\n\nHãy đảm bảo bạn đã bật Firestore Database và thiết lập Rules cho phép ghi.');
    }
  };

  const handleDeleteAlbum = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "albums", id));
      if (selectedAlbumId === id) setSelectedAlbumId(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      alert('Không thể xóa album: ' + error.message);
    }
  };

  const handleUpdateAlbum = async (id: string, updates: Partial<Album>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "albums", id), updates);
    } catch (error: any) {
      console.error("Error updating album:", error);
      // Don't alert for every keystroke update, but log it
    }
  };

  const handleSyncFolder = async (albumId: string, folderUrl: string) => {
    if (!folderUrl) return;

    setIsSyncing(albumId);
    try {
      // Since we are on a static host (Netlify), we use a public CORS proxy to fetch the folder HTML
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(folderUrl)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error('Không thể kết nối với dịch vụ proxy. Vui lòng thử lại sau.');
      }

      const data = await response.json();
      const html = data.contents;
      
      if (!html) {
        throw new Error('Không thể lấy dữ liệu từ Google Drive. Hãy đảm bảo thư mục đã được chia sẻ công khai.');
      }

      // Client-side regex parsing (same logic as previously in server.ts)
      const ids = new Set<string>();
      
      // Pattern 1: ["ID","FILENAME",...
      const fileEntryRegex = /\["([a-zA-Z0-9_-]{28,45})","([^"]+)"/g;
      let match;
      while ((match = fileEntryRegex.exec(html)) !== null) {
        const id = match[1];
        const fileName = match[2].toLowerCase();
        
        const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(fileName);
        if (isImage) {
          ids.add(id);
        }
      }

      // Pattern 2: Fallback broad search
      if (ids.size === 0) {
        const broadRegex = /"([a-zA-Z0-9_-]{33})"/g;
        while ((match = broadRegex.exec(html)) !== null) {
          const id = match[1];
          if (!id.startsWith('drive') && !id.includes('http')) {
            ids.add(id);
          }
        }
      }

      const folderIdMatch = folderUrl.match(/\/folders\/([^\/\?]+)/);
      const folderId = folderIdMatch ? folderIdMatch[1] : null;

      const newPhotos: Photo[] = Array.from(ids)
        .filter(id => id !== folderId)
        .map((id, index) => ({
          id: (Date.now() + index).toString(),
          url: `https://lh3.googleusercontent.com/u/0/d/${id}=w1600`,
          isVertical: false 
        }));
      
      if (newPhotos.length === 0) {
        alert('Không tìm thấy ảnh nào trong thư mục này. Hãy đảm bảo thư mục đã được chia sẻ công khai (Bất kỳ ai có liên kết đều có thể xem) và có chứa tệp ảnh.');
        return;
      }

      const album = albums.find(a => a.id === albumId);
      if (!album) return;

      const existingUrls = new Set(album.photos.map(p => p.url));
      const uniqueNewPhotos = newPhotos.filter((p: Photo) => !existingUrls.has(p.url));
      
      const updates: Partial<Album> = {
        photos: [...album.photos, ...uniqueNewPhotos]
      };
      
      const isPlaceholder = album.coverUrl.includes('picsum.photos') || !album.coverUrl;
      if (isPlaceholder && uniqueNewPhotos.length > 0) {
        updates.coverUrl = uniqueNewPhotos[0].url;
      }

      await updateDoc(doc(db, "albums", albumId), updates);
      alert(`Đã đồng bộ thành công ${uniqueNewPhotos.length} ảnh mới!`);
    } catch (error: any) {
      console.error("Sync error:", error);
      alert("Lỗi đồng bộ: " + error.message);
    } finally {
      setIsSyncing(null);
    }
  };

  const handleBulkAddPhotos = async (albumId: string) => {
    const input = prompt('Dán danh sách nhiều link ảnh Google Drive (mỗi link một dòng):');
    if (!input) return;
    
    const lines = input.split('\n').filter(line => line.trim());
    const newPhotos: Photo[] = lines.map((line, index) => ({
      id: (Date.now() + index).toString(),
      url: getDriveDirectLink(line.trim()),
      isVertical: false
    }));

    const album = albums.find(a => a.id === albumId);
    if (!album) return;

    await updateDoc(doc(db, "albums", albumId), {
      photos: [...album.photos, ...newPhotos]
    });
  };

  const togglePhotoOrientation = async (albumId: string, photoId: string) => {
    const album = albums.find(a => a.id === albumId);
    if (!album) return;

    await updateDoc(doc(db, "albums", albumId), {
      photos: album.photos.map(p => p.id === photoId ? { ...p, isVertical: !p.isVertical } : p)
    });
  };

  const handleDeletePhoto = async (albumId: string, photoId: string) => {
    const album = albums.find(a => a.id === albumId);
    if (!album) return;

    await updateDoc(doc(db, "albums", albumId), {
      photos: album.photos.filter(p => p.id !== photoId)
    });
  };

  const cleanBrokenPhotos = async (albumId: string) => {
    const album = albums.find(a => a.id === albumId);
    if (!album) return;

    const brokenIds = (window as any)[`broken_${albumId}`] || new Set();
    if (brokenIds.size === 0) {
      alert('Không tìm thấy ảnh lỗi nào để dọn dẹp.');
      return;
    }

    if (confirm(`Bạn có muốn xóa ${brokenIds.size} ảnh bị lỗi không?`)) {
      await updateDoc(doc(db, "albums", albumId), {
        photos: album.photos.filter(p => !brokenIds.has(p.id))
      });
      (window as any)[`broken_${albumId}`] = new Set();
      alert('Đã dọn dẹp xong!');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user) return;
    const file = e.target.files[0];
    const storageRef = ref(storage, `site/logo_${Date.now()}`);
    try {
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      handleUpdateSettings({ logoUrl: url });
    } catch (error: any) {
      alert('Tải ảnh lên thất bại: ' + error.message);
    }
  };

  // --- Renderers ---

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex justify-between items-center">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setSelectedAlbumId(null)}
        >
          {siteSettings.logoUrl ? (
            <img src={siteSettings.logoUrl} alt="Logo" className="w-10 h-10 rounded-full object-cover group-hover:scale-110 transition-transform" />
          ) : (
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <Camera size={20} />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tighter uppercase">{siteSettings.siteName}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest opacity-60">
            {siteSettings.facebook && (
              <a href={siteSettings.facebook} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity flex items-center gap-1">
                <Facebook size={12} /> Facebook
              </a>
            )}
            {siteSettings.phone && (
              <a href={`tel:${siteSettings.phone}`} className="hover:opacity-100 transition-opacity flex items-center gap-1">
                <Phone size={12} /> {siteSettings.phone}
              </a>
            )}
            {siteSettings.zalo && (
              <a href={`https://zalo.me/${siteSettings.zalo}`} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity flex items-center gap-1">
                <MessageCircle size={12} /> Zalo
              </a>
            )}
          </div>
          <button 
            onClick={() => setIsAdminOpen(true)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            title="Cài đặt Admin"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!selectedAlbumId ? (
            /* Album List View */
            <motion.div 
              key="album-list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-12 text-center space-y-2">
                <h2 className="text-4xl font-light tracking-tight">{siteSettings.siteName} Portfolio</h2>
                <p className="text-sm opacity-50 font-light max-w-lg mx-auto">{siteSettings.description}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {albums.map((album) => (
                  <motion.div 
                    key={album.id}
                    layoutId={`album-${album.id}`}
                    onClick={() => setSelectedAlbumId(album.id)}
                    className="group cursor-pointer relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100"
                  >
                    <img 
                      src={album.coverUrl} 
                      alt={album.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                      <p className="text-[10px] uppercase tracking-[0.2em] opacity-60 mb-1">Bộ sưu tập</p>
                      <h2 className="text-2xl font-light tracking-tight">{album.title}</h2>
                      {album.description && (
                        <p className="text-sm opacity-0 group-hover:opacity-70 transition-opacity duration-500 mt-2 line-clamp-2 font-light">
                          {album.description}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* Album Detail View */
            <motion.div 
              key="album-detail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <button 
                onClick={() => setSelectedAlbumId(null)}
                className="flex items-center gap-2 text-sm uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
              >
                <ChevronLeft size={16} /> Quay lại
              </button>

              <div className="max-w-3xl">
                <h2 className="text-5xl font-light tracking-tighter mb-4">{selectedAlbum?.title}</h2>
                <p className="text-lg text-black/60 font-light leading-relaxed">
                  {selectedAlbum?.description || 'Khám phá vẻ đẹp được ghi lại trong bộ sưu tập này.'}
                </p>
              </div>

              {/* Masonry-like Grid */}
              <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                {selectedAlbum?.photos.map((photo) => (
                  <motion.div 
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    className="relative break-inside-avoid rounded-xl overflow-hidden cursor-zoom-in group bg-gray-50"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img 
                      src={photo.url} 
                      alt="" 
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={24} />
                    </div>
                  </motion.div>
                ))}
              </div>

              {selectedAlbum?.photos.length === 0 && (
                <div className="py-24 text-center border-2 border-dashed border-black/5 rounded-3xl">
                  <ImageIcon className="mx-auto mb-4 opacity-20" size={48} />
                  <p className="text-black/40 uppercase tracking-widest text-sm">Chưa có ảnh nào trong album này</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Photo Lightbox */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-12"
            onClick={() => setSelectedPhoto(null)}
          >
            <button className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
              <X size={32} />
            </button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={selectedPhoto.url} 
              alt="" 
              referrerPolicy="no-referrer"
              className="max-w-full max-h-full object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsAdminOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full md:max-w-xl h-full bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-black/5 flex justify-between items-center">
                <h3 className="text-xl font-bold uppercase tracking-tight">Quản trị Portfolio</h3>
                <button onClick={() => setIsAdminOpen(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              {!user ? (
                /* Login View */
                <div className="flex-1 flex items-center justify-center p-12">
                  <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
                    <div className="text-center space-y-2 mb-8">
                      <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
                        <LogIn size={32} />
                      </div>
                      <h4 className="text-2xl font-bold tracking-tight">Đăng nhập Admin</h4>
                      <p className="text-sm text-black/40">Vui lòng đăng nhập để quản lý website.</p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Email</label>
                        <input 
                          type="email" 
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="w-full bg-gray-50 border border-black/5 rounded-xl px-4 py-3 outline-none focus:border-black transition-colors"
                          placeholder="admin@vmedia.vn"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Mật khẩu</label>
                        <input 
                          type="password" 
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full bg-gray-50 border border-black/5 rounded-xl px-4 py-3 outline-none focus:border-black transition-colors"
                          placeholder="••••••••"
                          required
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-black/80 transition-colors"
                    >
                      Đăng nhập
                    </button>
                  </form>
                </div>
              ) : (
                /* Admin Dashboard View */
                <div className="flex-1 overflow-y-auto p-6 space-y-12">
                  {/* Site Settings Section */}
                  <SiteSettingsEditor 
                    settings={siteSettings}
                    onUpdate={handleUpdateSettings}
                    onLogout={handleLogout}
                    onLogoUpload={handleLogoUpload}
                  />

                  {/* Album Management Section */}
                  <section className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-black/40">Quản lý Album</h4>
                      <button 
                        onClick={handleAddAlbum}
                        className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-black/80 transition-colors"
                      >
                        <Plus size={16} /> Thêm Album
                      </button>
                    </div>

                    <div className="space-y-4">
                      {firestoreError && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs">
                          <p className="font-bold mb-1">Cảnh báo hệ thống:</p>
                          <p>{firestoreError}</p>
                          <p className="mt-2 text-[10px] opacity-70 italic">* Lỗi này thường do chưa cấu hình Firestore Rules hoặc chưa kích hoạt Database.</p>
                        </div>
                      )}
                      {albums.length === 0 ? (
                        <div className="py-12 border-2 border-dashed border-black/5 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 bg-gray-50/50">
                          <div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center text-black/20">
                            <Plus size={24} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold uppercase tracking-widest text-black/40">Chưa có album nào</p>
                            <p className="text-xs text-black/30">Nhấn nút "Thêm Album" ở trên để bắt đầu tạo bộ sưu tập mới.</p>
                          </div>
                        </div>
                      ) : (
                        albums.map((album: Album) => (
                          <AlbumItemEditor
                            key={album.id}
                            album={album}
                            onUpdate={handleUpdateAlbum}
                            onDelete={handleDeleteAlbum}
                            onSync={handleSyncFolder}
                            onBulkAdd={handleBulkAddPhotos}
                            onCleanBroken={cleanBrokenPhotos}
                            onToggleOrientation={togglePhotoOrientation}
                            onDeletePhoto={handleDeletePhoto}
                            isSyncing={isSyncing === album.id}
                          />
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}
              <div className="p-6 border-t border-black/5 bg-gray-50 text-[10px] text-black/40 uppercase tracking-[0.2em] text-center">
                Hệ thống quản trị Portfolio VMEDIA
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-24 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-bold tracking-tighter uppercase mb-2">{siteSettings.siteName}</h2>
          <p className="text-sm text-black/40 font-light">{siteSettings.description}</p>
        </div>
        <div className="flex gap-8 text-xs uppercase tracking-widest font-bold">
          {siteSettings.facebook && (
            <a href={siteSettings.facebook} target="_blank" rel="noopener noreferrer" className="hover:opacity-50 transition-opacity">Facebook</a>
          )}
          {siteSettings.phone && (
            <a href={`tel:${siteSettings.phone}`} className="hover:opacity-50 transition-opacity">Điện thoại</a>
          )}
          {siteSettings.zalo && (
            <a href={`https://zalo.me/${siteSettings.zalo}`} target="_blank" rel="noopener noreferrer" className="hover:opacity-50 transition-opacity">Zalo</a>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-black/20">
          © {new Date().getFullYear()} {siteSettings.siteName}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
