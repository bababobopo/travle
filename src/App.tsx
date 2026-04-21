/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, MapPin, Clock, Edit2, ExternalLink, Trash2, Image as ImageIcon, Upload, Loader2, Calendar, Lock, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Itinerary {
  id: string;
  day: number; // 0 to 6 (May 24 to May 30)
  startHour: number; // 8 to 22
  startMinute: number; // 0 to 59
  endHour: number;
  endMinute: number;
  title: string;
  description: string;
  imageUrls: string[];
  mapsUrl?: string;
  color: string;
}

const DAYS = [
  { date: '5/24', label: '週五' },
  { date: '5/25', label: '週六' },
  { date: '5/26', label: '週日' },
  { date: '5/27', label: '週一' },
  { date: '5/28', label: '週二' },
  { date: '5/29', label: '週三' },
  { date: '5/30', label: '週四' },
];

const MORANDI_COLORS = [
  'bg-morandi-blue/80',
  'bg-morandi-green/80',
  'bg-morandi-pink/80',
  'bg-morandi-clay/80',
  'bg-morandi-grey/80',
];

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 to 22:00

export default function App() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch from Google Sheets
  useEffect(() => {
    fetch('/api/itineraries')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setItineraries(data);
        } else {
          console.error('Expected array of itineraries, got:', data);
          setItineraries([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch itineraries:', err);
        setLoading(false);
      });
  }, []);

  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'add' | null>(null);
  const [selectedItem, setSelectedItem] = useState<Itinerary | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  
  // Auth State
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return localStorage.getItem('travel_auth_v2') === 'true';
  });
  const [inputCode, setInputCode] = useState('');
  const [isCodeError, setIsCodeError] = useState(false);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const correctCode = (import.meta as any).env.VITE_ACCESS_CODE || '2026travel';
    if (inputCode === correctCode) {
      setIsAuthorized(true);
      localStorage.setItem('travel_auth_v2', 'true');
      setIsCodeError(false);
    } else {
      setIsCodeError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    localStorage.removeItem('travel_auth_v2');
  };

  // Form State
  const [formDay, setFormDay] = useState(0);
  const [formStartHour, setFormStartHour] = useState(8);
  const [formStartMinute, setFormStartMinute] = useState(0);
  const [formEndHour, setFormEndHour] = useState(9);
  const [formEndMinute, setFormEndMinute] = useState(0);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formImageUrls, setFormImageUrls] = useState<string[]>([]);
  const [formMapsUrl, setFormMapsUrl] = useState('');

  const handleAddClick = (day: number, hour: number) => {
    setSelectedItem(null);
    setFormDay(day);
    setFormStartHour(hour);
    setFormStartMinute(0);
    setFormEndHour(hour + 1);
    setFormEndMinute(0);
    setFormTitle('');
    setFormDesc('');
    setFormImageUrls([]);
    setFormMapsUrl('');
    setModalMode('add');
  };

  const handleItemClick = (item: Itinerary, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem(item);
    setModalMode('view');
  };

  const startEditing = () => {
    if (!selectedItem) return;
    setFormDay(selectedItem.day);
    setFormStartHour(selectedItem.startHour);
    setFormStartMinute(selectedItem.startMinute);
    setFormEndHour(selectedItem.endHour);
    setFormEndMinute(selectedItem.endMinute);
    setFormTitle(selectedItem.title);
    setFormDesc(selectedItem.description);
    setFormImageUrls(selectedItem.imageUrls || []);
    setFormMapsUrl(selectedItem.mapsUrl || '');
    setModalMode('edit');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setFormImageUrls(prev => [...prev, data.imageUrl]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('圖片上傳失敗');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setFormImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const saveItinerary = async () => {
    if (!formTitle) return;

    const startTotal = formStartHour * 60 + formStartMinute;
    const endTotal = formEndHour * 60 + formEndMinute;
    if (endTotal <= startTotal) {
      alert('結束時間必須晚於開始時間');
      return;
    }

    const newItem: Itinerary = {
      id: selectedItem?.id || Math.random().toString(36).substr(2, 9),
      day: formDay,
      startHour: formStartHour,
      startMinute: formStartMinute,
      endHour: formEndHour,
      endMinute: formEndMinute,
      title: formTitle,
      description: formDesc,
      imageUrls: formImageUrls,
      mapsUrl: formMapsUrl,
      color: selectedItem?.color || MORANDI_COLORS[Math.floor(Math.random() * MORANDI_COLORS.length)]
    };

    try {
      const res = await fetch('/api/itineraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      
      if (res.ok) {
        if (selectedItem) {
          setItineraries(itineraries.map(item => item.id === selectedItem.id ? newItem : item));
        } else {
          setItineraries([...itineraries, newItem]);
        }
        setModalMode(null);
      } else {
        alert('儲存失敗，請檢查 Google Sheets 設定');
      }
    } catch (err) {
      console.error('Error saving:', err);
      alert('儲存出錯');
    }
  };

  const deleteItinerary = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('確定要刪除此行程嗎？')) return;

    try {
      const res = await fetch(`/api/itineraries/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItineraries(itineraries.filter(item => item.id !== id));
        setModalMode(null);
      } else {
        alert('刪除失敗');
      }
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-morandi-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl max-w-sm w-full border border-white/40 text-center"
        >
          <div className="mb-8">
            <div className="inline-flex p-4 bg-morandi-grey rounded-full mb-4 shadow-sm">
              <Lock className="text-gray-600" size={32} />
            </div>
            <h1 className="font-serif text-3xl text-gray-800 mb-2">私藏行程</h1>
            <p className="text-gray-500 text-sm tracking-widest">請輸入旅行暗號</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="relative">
              <input
                type="password"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="••••••"
                className={`w-full px-4 py-4 rounded-2xl border ${isCodeError ? 'border-red-300 bg-red-50' : 'border-gray-100'} focus:outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all text-center text-2xl tracking-[0.5em] shadow-inner`}
              />
              {isCodeError && (
                <p className="text-red-400 text-xs mt-3 flex items-center justify-center gap-1">
                  <X size={12} /> 暗號無效，請重試
                </p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-4 bg-morandi-blue text-white font-medium rounded-2xl hover:bg-opacity-90 transition-all shadow-lg shadow-morandi-blue/20 active:scale-95"
            >
              開啟旅程
            </button>
          </form>
          
          <div className="mt-12 text-[10px] text-gray-400 uppercase tracking-widest leading-loose">
            Private Access Only<br/>
            © 2026 Morandi Travel
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-morandi-bg p-4 md:p-8">
      <header className="max-w-7xl mx-auto mb-12 text-center relative">
        <div className="absolute -top-2 -right-2 md:top-0 md:right-0">
          <button 
            onClick={handleLogout}
            className="p-3 text-gray-400 hover:text-red-400 hover:bg-white/50 rounded-full transition-all"
            title="鎖定應用程式"
          >
            <LogOut size={20} />
          </button>
        </div>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-6xl md:text-8xl text-gray-800 tracking-tight"
        >
          旅遊行程
        </motion.h1>
        <p className="text-morandi-clay font-medium tracking-widest uppercase text-sm mt-4">
          5月24日 — 5月30日 
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-morandi-blue"></div>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl overflow-x-auto border border-white/20 custom-scrollbar">
          <div className="calendar-grid border-b border-gray-100 bg-white/80 min-w-[800px]">
            <div className="p-4 border-r border-gray-100"></div>
            {DAYS.map((day, i) => (
              <div key={i} className="p-4 text-center border-r border-gray-100 last:border-r-0">
                <span className="block text-xs font-semibold text-morandi-clay uppercase tracking-wider mb-1">{day.label}</span>
                <span className="text-xl font-medium text-gray-700">{day.date}</span>
              </div>
            ))}
          </div>

          <div className="calendar-grid relative min-w-[800px]">
            <div className="bg-white/30 border-r border-gray-100">
              {HOURS.map(hour => (
                <div key={hour} className="time-slot flex items-center justify-center text-[10px] font-bold text-gray-400">
                  {hour}:00
                </div>
              ))}
            </div>

            {DAYS.map((_, dayIndex) => (
              <div key={dayIndex} className="relative border-r border-gray-100 last:border-r-0 bg-white/10">
                {HOURS.map(hour => (
                  <div 
                    key={hour} 
                    className="time-slot group relative cursor-crosshair hover:bg-white/40 transition-colors"
                    onClick={() => handleAddClick(dayIndex, hour)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={16} className="text-morandi-clay" />
                    </div>
                  </div>
                ))}

                {itineraries.filter(item => item.day === dayIndex).map(item => {
                  const startTotal = (item.startHour - 8) * 60 + item.startMinute;
                  const endTotal = (item.endHour - 8) * 60 + item.endMinute;
                  const duration = endTotal - startTotal;
                  
                  return (
                    <motion.div
                      layoutId={item.id}
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={(e) => handleItemClick(item, e)}
                      className={`absolute left-1 right-1 itinerary-item ${item.color} border border-white/30 z-10 flex flex-col p-2`}
                      style={{ 
                        top: `${startTotal}px`,
                        height: `${duration - 4}px`
                      }}
                    >
                      <div className="flex justify-between items-start overflow-hidden">
                        <h3 className="font-semibold text-gray-800 leading-tight truncate text-[11px]">{item.title}</h3>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-gray-600 mt-0.5 opacity-80">
                        <Clock size={8} />
                        <span>
                          {item.startHour}:{item.startMinute.toString().padStart(2, '0')} - {item.endHour}:{item.endMinute.toString().padStart(2, '0')}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalMode(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100 max-h-[90vh] overflow-y-auto"
            >
              {modalMode === 'view' && selectedItem ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <h2 className="font-serif text-3xl text-gray-800">{selectedItem.title}</h2>
                    <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-gray-600">
                      <Clock size={18} className="text-morandi-blue" />
                      <span className="text-sm">
                        {DAYS[selectedItem.day].label} {selectedItem.startHour}:{selectedItem.startMinute.toString().padStart(2, '0')} - {selectedItem.endHour}:{selectedItem.endMinute.toString().padStart(2, '0')}
                      </span>
                    </div>
                    {selectedItem.mapsUrl && (
                      <div className="flex items-center gap-3 text-gray-600">
                        <MapPin size={18} className="text-morandi-green" />
                        <a 
                          href={selectedItem.mapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-morandi-blue hover:underline flex items-center gap-1"
                        >
                          在 Google 地圖中查看 <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>

                  {selectedItem.description && (
                    <div className="bg-gray-50 p-4 rounded-xl">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedItem.description}</p>
                    </div>
                  )}

                  {selectedItem.imageUrls && selectedItem.imageUrls.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {selectedItem.imageUrls.map((url, index) => (
                        <div 
                          key={index}
                          className="rounded-xl overflow-hidden border border-gray-100 shadow-sm cursor-zoom-in group relative aspect-square"
                          onClick={() => setFullScreenImage(url)}
                        >
                          <img 
                            src={url} 
                            alt={`${selectedItem.title} ${index + 1}`} 
                            className="w-full h-full object-cover bg-gray-50 transition-transform group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <ImageIcon className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={24} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => deleteItinerary(selectedItem.id)}
                      className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button 
                      onClick={startEditing}
                      className="flex-1 px-4 py-2 bg-morandi-grey text-gray-700 font-medium rounded-lg hover:bg-opacity-80 transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 size={18} /> 編輯行程
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="font-serif text-2xl text-gray-800 mb-6">
                    {modalMode === 'edit' ? '編輯行程' : '新增行程'}
                  </h2>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">活動標題</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">開始時間</label>
                      <div className="flex items-center gap-2">
                        <select 
                          value={formStartHour}
                          onChange={(e) => setFormStartHour(parseInt(e.target.value))}
                          className="flex-1 px-2 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                        >
                          {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                        <select 
                          value={formStartMinute}
                          onChange={(e) => setFormStartMinute(parseInt(e.target.value))}
                          className="flex-1 px-2 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                        >
                          {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">結束時間</label>
                      <div className="flex items-center gap-2">
                        <select 
                          value={formEndHour}
                          onChange={(e) => setFormEndHour(parseInt(e.target.value))}
                          className="flex-1 px-2 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                        >
                          {HOURS.concat(23).map(h => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                        <select 
                          value={formEndMinute}
                          onChange={(e) => setFormEndMinute(parseInt(e.target.value))}
                          className="flex-1 px-2 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                        >
                          {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Google Maps 連結</label>
                    <input 
                      type="text" 
                      value={formMapsUrl}
                      onChange={(e) => setFormMapsUrl(e.target.value)}
                      placeholder="https://goo.gl/maps/..."
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">行程圖片</label>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*"
                          className="hidden"
                        />
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="px-4 py-2 bg-morandi-grey text-gray-700 rounded-xl hover:bg-opacity-80 transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
                        >
                          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                          <span className="text-sm font-medium">上傳</span>
                        </button>
                      </div>
                      
                      {formImageUrls.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {formImageUrls.map((url, index) => (
                            <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 shadow-sm bg-gray-100">
                              <img src={url} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                              <button 
                                onClick={() => removeImage(index)}
                                className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">地點 / 備註</label>
                    <textarea 
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all h-24 resize-none"
                    />
                  </div>

                  <div className="mt-8 flex gap-3">
                    <button 
                      onClick={() => setModalMode(selectedItem ? 'view' : null)}
                      className="flex-1 px-4 py-2 text-gray-500 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      onClick={saveItinerary}
                      className="flex-1 px-4 py-2 bg-morandi-blue text-white font-medium rounded-lg shadow-lg shadow-morandi-blue/20 hover:bg-opacity-90 transition-all"
                    >
                      {modalMode === 'edit' ? '更新' : '儲存行程'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fullScreenImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-5xl w-full h-full flex items-center justify-center"
              onClick={() => setFullScreenImage(null)}
            >
              <img 
                src={fullScreenImage} 
                alt="Full Screen" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setFullScreenImage(null)}
                className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
              >
                <X size={32} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto mt-12 text-center text-gray-400 text-xs tracking-widest uppercase">
        Designed with Morandi Aesthetics • 2026
      </footer>
    </div>
  );
}
