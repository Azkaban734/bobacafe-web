import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  MapPin,
  Search,
  RefreshCw,
  LogOut,
  Clock,
  AlertCircle,
} from "lucide-react";

// --- DATA SOURCE ---
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEUW3vd8VtYtI7vy_wpMeATDMZDuW5-y4u7jmyw0qlEaBSZ8fBdNnFKMl1yTwJmQ8mRVC2jvE812b9/pub?gid=1943990106&single=true&output=csv";

const App = () => {
  const [rawData, setRawData] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // --- STYLE INJECTION (Ensures Tailwind loads) ---
  useEffect(() => {
    if (!document.getElementById("tailwind-cdn")) {
      const script = document.createElement("script");
      script.id = "tailwind-cdn";
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    
    const style = document.createElement("style");
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      body { font-family: 'Inter', sans-serif !important; }
    `;
    document.head.appendChild(style);

    fetchSheetData();
  }, []);

  // --- DATA FETCHING ---
  const fetchSheetData = async () => {
    setIsLoading(true);
    setError("");

    const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    try {
      let response = await fetchWithTimeout(SHEET_URL);

      if (!response.ok) {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(SHEET_URL)}`;
        const proxyResponse = await fetchWithTimeout(proxyUrl);
        const proxyData = await proxyResponse.json();
        if (proxyData.contents) {
          processRawData(proxyData.contents);
          return;
        }
        throw new Error("Could not fetch via proxy");
      }

      const text = await response.text();
      processRawData(text);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Не удалось загрузить данные. Проверьте публикацию таблицы.");
      setIsLoading(false);
    }
  };

  const processRawData = (text) => {
    if (text.trim().startsWith("<!DOCTYPE html>")) {
      setError("Ошибка: получена страница HTML вместо данных.");
      setIsLoading(false);
      return;
    }
    setRawData(text);
    setIsLoading(false);
  };

  // --- PARSING ---
  const parsedData = useMemo(() => {
    if (!rawData) return [];
    try {
      const rows = rawData.trim().split(/\r?\n/);
      if (rows.length < 2) return [];

      const headers = rows[0].split(/,|\t/).map(h => h.trim().replace(/^"|"$/g, ""));
      const shiftData = [];

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split(/,|\t/).map(c => c.trim().replace(/^"|"$/g, ""));
        const date = cells[0];
        if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;

        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
          const employeeName = cells[colIndex];
          const header = headers[colIndex];
          if (!employeeName || ["—", "-", "", "off", "вых"].includes(employeeName.toLowerCase())) continue;

          let store = header;
          let time = "Смена";
          if (header.includes("-")) {
            const parts = header.split("-");
            time = parts.pop().trim();
            store = parts.join("-").trim();
          }

          shiftData.push({ name: employeeName, date, store, time });
        }
      }
      return shiftData;
    } catch (e) {
      return [];
    }
  }, [rawData]);

  const employeeNames = useMemo(() => {
    const names = new Set(parsedData.map((d) => d.name));
    return Array.from(names).filter(Boolean).sort();
  }, [parsedData]);

  const userShifts = useMemo(() => {
    if (!selectedUser) return [];
    return parsedData
      .filter((d) => d.name === selectedUser)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [parsedData, selectedUser]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 shadow-sm flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 p-1.5 rounded-lg text-white shadow-indigo-200 shadow-lg">
            <Calendar className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800 italic">ShiftFinder</h1>
        </div>
        <button
          onClick={fetchSheetData}
          disabled={isLoading}
          className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-90 disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="max-w-xl mx-auto p-4 pb-20">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-2xl flex items-start gap-3 border border-rose-100 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        )}

        {isLoading && !rawData && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
            </div>
            <p className="font-bold text-slate-400">Синхронизация...</p>
          </div>
        )}

        {!selectedUser && (!isLoading || rawData) && (
          <div className="space-y-8 animate-in fade-in duration-700 mt-6">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-black text-slate-800 tracking-tight">Кто работает?</h2>
              <p className="text-slate-400 font-medium text-lg">Найдите себя в общем списке</p>
            </div>

            <div className="bg-white p-2 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100">
              <div className="relative">
                <select
                  className="w-full p-6 pl-14 bg-transparent appearance-none focus:outline-none text-xl font-bold text-slate-700 cursor-pointer"
                  onChange={(e) => setSelectedUser(e.target.value)}
                  value=""
                >
                  <option value="" disabled>Ваше имя...</option>
                  {employeeNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <Search className="w-7 h-7 text-indigo-500 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                   <div className="w-3 h-3 border-b-2 border-r-2 border-slate-300 rotate-45" />
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <span className="flex items-center gap-1.5 text-indigo-500">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> Live System
              </span>
              <span>•</span>
              <span>Total: {parsedData.length} Shifts</span>
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500 mt-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-indigo-600 font-black text-xs uppercase tracking-widest mb-1 block bg-indigo-50 px-2 py-0.5 rounded-full w-fit">Employee Profile</span>
                <h2 className="text-3xl font-black text-slate-800 leading-none mt-2">{selectedUser}</h2>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-3 bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all active:scale-95 shadow-sm"
              >
                <LogOut className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="font-black text-slate-400 text-xs uppercase tracking-widest pl-2">Ближайшие смены</p>
              {userShifts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-[2.5rem] border-4 border-dashed border-slate-100">
                  <p className="text-slate-300 font-black text-lg">График пуст</p>
                </div>
              ) : (
                userShifts.map((shift, idx) => (
                  <div key={idx} className="group bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-5 hover:shadow-xl hover:shadow-slate-200/50 hover:border-indigo-100 transition-all relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Calendar className="w-16 h-16 text-indigo-900" />
                    </div>
                    
                    <div className="flex items-center gap-5 relative">
                      <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg">
                        <span className="text-[10px] font-black uppercase opacity-60 leading-none mb-1">
                           {new Date(shift.date).toLocaleDateString('ru-RU', { month: 'short' })}
                        </span>
                        <span className="text-2xl font-black leading-none">
                          {new Date(shift.date).getDate()}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-1 italic">
                          {new Date(shift.date).toLocaleDateString('ru-RU', { weekday: 'long' })}
                        </p>
                        <p className="text-xl font-black text-slate-800">{shift.date}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
                          <MapPin className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Store</span>
                        </div>
                        <p className="text-sm font-extrabold text-slate-700 truncate">{shift.store}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Type</span>
                        </div>
                        <p className={`text-sm font-extrabold ${shift.time.toLowerCase().includes('ночь') ? 'text-indigo-600' : 'text-amber-600'}`}>{shift.time}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <button
              onClick={() => { setSelectedUser(null); window.scrollTo(0,0); }}
              className="w-full p-4 text-slate-400 font-black text-sm uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Вернуться назад
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
