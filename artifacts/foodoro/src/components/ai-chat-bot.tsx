import { useState, useRef, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";

const TOKEN_KEY = "foodoro-token";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Floating AI assistant — "Foodie", the cute restaurant mascot robot.
 *   • Floats with subtle bounce animation
 *   • Eyes follow the cursor when you hover
 *   • Winks periodically + on hover
 *   • Speech bubble taunts to grab attention if you ignore him
 *   • Click → opens chat panel (Claude Haiku via Emergent LLM)
 */
export function AiChatBot() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language === "ar";
  const [open, setOpen] = useState(false);
  const [winking, setWinking] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Seed greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: isAr
            ? `أهلاً يا شيف ${user?.name?.split(" ")[0] ?? ""}! 👨‍🍳✨\n\nأنا فودي، مساعدك الذكي في FOODPRO. اسألني عن:\n• تحليل المبيعات والأرباح\n• نصائح زيادة الإيرادات\n• إدارة المخزون والهدر\n• هندسة قائمة الطعام\n• أي شيء تحتاجه! 🚀`
            : `Hey Chef ${user?.name?.split(" ")[0] ?? "there"}! 👨‍🍳✨\n\nI'm Foodie, your FOODPRO AI assistant. Ask me about:\n• Sales analytics & profit insights\n• Revenue-boosting tips\n• Inventory & waste management\n• Menu engineering\n• Anything you need! 🚀`,
        },
      ]);
    }
  }, [open, isAr, user?.name, messages.length]);

  // Periodic wink + bubble pop
  useEffect(() => {
    if (open) return;
    const winkId = setInterval(() => {
      setWinking(true);
      setTimeout(() => setWinking(false), 350);
    }, 7000);

    // Show a friendly bubble after 5s of idle
    const bubbleId = setTimeout(() => setShowBubble(true), 5000);
    const bubbleHideId = setTimeout(() => setShowBubble(false), 12000);

    return () => {
      clearInterval(winkId);
      clearTimeout(bubbleId);
      clearTimeout(bubbleHideId);
    };
  }, [open]);

  // Eyes follow cursor
  useEffect(() => {
    if (open) return;
    const handler = (e: MouseEvent) => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const max = 3;
      if (dist === 0) return setEyeOffset({ x: 0, y: 0 });
      setEyeOffset({
        x: (dx / dist) * Math.min(max, dist / 30),
        y: (dy / dist) * Math.min(max, dist / 30),
      });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [open]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? "AI service error");
      }
      const data = (await res.json()) as { reply: string };
      setMessages([...next, { role: "assistant", content: data.reply || "..." }]);
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: isAr
            ? `عذراً يا شيف، حصل خطأ: ${(err as Error).message} 😅`
            : `Oops Chef, something went wrong: ${(err as Error).message} 😅`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const quickPrompts = isAr
    ? ["كيف أزيد المبيعات؟", "نصائح إدارة المخزون", "هندسة قائمة الطعام"]
    : ["How to boost sales?", "Inventory management tips", "Menu engineering ideas"];

  return (
    <>
      {/* ── Floating Foodie button ────────────────────── */}
      {!open && (
        <>
          {/* Speech bubble taunt */}
          {showBubble && (
            <div
              className={`fixed bottom-28 z-40 ${isAr ? "start-6" : "end-6"} animate-in fade-in slide-in-from-bottom-2 duration-500`}
              data-testid="ai-chat-bubble-taunt"
            >
              <div className="relative bg-white text-gray-800 text-sm font-medium px-4 py-2.5 rounded-2xl shadow-xl max-w-[220px]">
                <button
                  onClick={() => setShowBubble(false)}
                  className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-gray-200 text-gray-600 rounded-full text-[10px] font-bold hover:bg-gray-300 flex items-center justify-center"
                  aria-label="dismiss"
                >
                  ✕
                </button>
                {isAr ? "👋 محتاج مساعدة؟ اسألني!" : "👋 Need help? Ask me!"}
                <div className={`absolute -bottom-1.5 ${isAr ? "start-6" : "end-6"} w-3 h-3 bg-white rotate-45`} />
              </div>
            </div>
          )}

          <button
            ref={buttonRef}
            type="button"
            onClick={() => { setOpen(true); setShowBubble(false); }}
            onMouseEnter={() => { setHovering(true); setWinking(true); }}
            onMouseLeave={() => { setHovering(false); setWinking(false); }}
            aria-label={isAr ? "افتح المساعد فودي" : "Open Foodie AI"}
            data-testid="ai-chat-bot-toggle"
            className="fixed bottom-6 end-6 z-50 group"
          >
            <div className="relative animate-bounce-slow">
              {/* glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#E67E22] to-[#F39C12] rounded-full blur-2xl opacity-50 group-hover:opacity-90 transition-opacity scale-125" />

              {/* cloud body — no white background, transparent so the 3D cloud shape shows */}
              <div
                className={`relative w-[88px] h-[88px] flex items-center justify-center transition-transform duration-300 ${hovering ? "scale-110 -rotate-3" : ""} active:scale-95`}
              >
                <FoodieFace eyeOffset={eyeOffset} winking={winking} happy={hovering} size={88} />
              </div>

              {/* online pulse */}
              <div className="absolute bottom-1 end-1 w-5 h-5 bg-emerald-500 border-2 border-[#0B0F19] rounded-full flex items-center justify-center shadow-lg z-10">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
            </div>
          </button>
        </>
      )}

      {/* ── Chat panel ────────────────────────────────── */}
      {open && (
        <div
          dir={isAr ? "rtl" : "ltr"}
          data-testid="ai-chat-panel"
          className="fixed bottom-6 end-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-3rem)] bg-[#1F2937] border border-white/10 rounded-3xl shadow-2xl shadow-[#E67E22]/30 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300"
        >
          {/* Header */}
          <div className="relative flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-[#E67E22] via-[#F39C12] to-[#FBBF24] overflow-hidden">
            {/* sparkles bg */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-2 start-12 w-1 h-1 bg-white rounded-full" />
              <div className="absolute top-6 end-16 w-1.5 h-1.5 bg-white rounded-full" />
              <div className="absolute bottom-3 start-20 w-1 h-1 bg-white rounded-full" />
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center">
              <FoodieFace eyeOffset={{ x: 0, y: 0 }} winking={false} happy size={48} />
            </div>
            <div className="relative flex-1">
              <p className="text-white font-bold text-sm flex items-center gap-1.5">
                {isAr ? "فودي" : "Foodie"}
                <span className="text-xs">🤖</span>
              </p>
              <p className="text-white/90 text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                {isAr ? "متصل · مدعوم بـ Claude" : "Online · Powered by Claude"}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="relative text-white/90 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
              data-testid="ai-chat-close-btn"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0F1623]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
                {m.role === "assistant" && (
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                    <FoodieFace eyeOffset={{ x: 0, y: 0 }} winking={false} happy size={36} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-[#E67E22] to-[#F39C12] text-white rounded-2xl rounded-be-md shadow-lg shadow-[#E67E22]/20"
                      : "bg-white/5 text-gray-100 rounded-2xl rounded-bs-md border border-white/5"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start gap-2">
                <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                  <FoodieFace eyeOffset={{ x: 0, y: 0 }} winking={false} happy size={36} />
                </div>
                <div className="bg-white/5 px-3.5 py-3 rounded-2xl rounded-bs-md border border-white/5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[#E67E22] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-[#E67E22] rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-1.5 h-1.5 bg-[#E67E22] rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
                </div>
              </div>
            )}

            {/* Quick prompts (only when empty conversation) */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-2 pt-2">
                {quickPrompts.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-full border border-white/10 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-3 py-3 border-t border-white/10 bg-[#1F2937] flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAr ? "اسأل فودي..." : "Ask Foodie..."}
              disabled={loading}
              data-testid="ai-chat-input"
              className="flex-1 bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              data-testid="ai-chat-send-btn"
              className="bg-gradient-to-r from-[#E67E22] to-[#F39C12] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-3.5 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#E67E22]/20"
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isAr ? "scaleX(-1)" : undefined }}>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-bounce-slow { animation: bounce-slow 3s ease-in-out infinite; }
      `}</style>
    </>
  );
}

// ── Foodie face — round, cute, eyes follow cursor, can wink, smile ─────────
function FoodieFace({
  eyeOffset,
  winking,
  happy,
  size,
}: {
  eyeOffset: { x: number; y: number };
  winking: boolean;
  happy: boolean;
  size: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* 3D cloud body gradient — orange volumetric */}
        <radialGradient id="cloudBody" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFE6CA" />
          <stop offset="35%" stopColor="#F4B069" />
          <stop offset="75%" stopColor="#E67E22" />
          <stop offset="100%" stopColor="#B85C00" />
        </radialGradient>
        {/* highlight bloom */}
        <radialGradient id="cloudHi" cx="30%" cy="25%" r="35%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        {/* under-shadow */}
        <radialGradient id="cloudShadow" cx="65%" cy="80%" r="50%">
          <stop offset="0%" stopColor="#7B3F00" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7B3F00" stopOpacity="0" />
        </radialGradient>
        {/* cheek blush */}
        <radialGradient id="blush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF6B6B" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF6B6B" stopOpacity="0" />
        </radialGradient>
        {/* drop shadow under cloud */}
        <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
        </filter>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy="92" rx="32" ry="4" fill="url(#groundShadow)" />

      {/* CLOUD BODY (8 puffs forming a chunky cute cloud) */}
      <g>
        {/* base shadow layer */}
        <g filter="url(#softShadow)" opacity="0.7">
          <ellipse cx="50" cy="60" rx="36" ry="22" fill="#9C4A00" />
        </g>
        {/* main body */}
        <ellipse cx="50" cy="56" rx="34" ry="22" fill="url(#cloudBody)" />
        {/* puff top-left */}
        <circle cx="28" cy="44" r="14" fill="url(#cloudBody)" />
        {/* puff top-center */}
        <circle cx="48" cy="36" r="16" fill="url(#cloudBody)" />
        {/* puff top-right */}
        <circle cx="68" cy="42" r="13" fill="url(#cloudBody)" />
        {/* puff right */}
        <circle cx="78" cy="56" r="11" fill="url(#cloudBody)" />
        {/* puff left */}
        <circle cx="20" cy="58" r="11" fill="url(#cloudBody)" />
        {/* puff bottom-left */}
        <circle cx="32" cy="70" r="11" fill="url(#cloudBody)" />
        {/* puff bottom-right */}
        <circle cx="68" cy="70" r="11" fill="url(#cloudBody)" />

        {/* glossy highlight */}
        <ellipse cx="38" cy="34" rx="22" ry="14" fill="url(#cloudHi)" />
        {/* under-shadow blend */}
        <ellipse cx="55" cy="72" rx="28" ry="14" fill="url(#cloudShadow)" />
      </g>

      {/* CHEEKS */}
      <ellipse cx="26" cy="58" rx="6" ry="3.5" fill="url(#blush)" />
      <ellipse cx="74" cy="58" rx="6" ry="3.5" fill="url(#blush)" />

      {/* EYES */}
      {/* left eye - sparkly */}
      <ellipse cx={38 + eyeOffset.x * 0.8} cy={50 + eyeOffset.y * 0.8} rx="4.5" ry="5.5" fill="#1F2937" />
      <circle cx={39.5 + eyeOffset.x * 0.8} cy={48 + eyeOffset.y * 0.8} r="1.6" fill="white" />
      <circle cx={37 + eyeOffset.x * 0.8} cy={52 + eyeOffset.y * 0.8} r="0.8" fill="white" opacity="0.7" />

      {/* right eye — winks */}
      {winking ? (
        <path
          d="M58 50 Q63 46 68 50"
          stroke="#1F2937"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <>
          <ellipse cx={63 + eyeOffset.x * 0.8} cy={50 + eyeOffset.y * 0.8} rx="4.5" ry="5.5" fill="#1F2937" />
          <circle cx={64.5 + eyeOffset.x * 0.8} cy={48 + eyeOffset.y * 0.8} r="1.6" fill="white" />
          <circle cx={62 + eyeOffset.x * 0.8} cy={52 + eyeOffset.y * 0.8} r="0.8" fill="white" opacity="0.7" />
        </>
      )}

      {/* MOUTH — happy smile */}
      {happy ? (
        <>
          <path
            d="M40 64 Q50 76 60 64"
            stroke="#7B3F00"
            strokeWidth="3"
            strokeLinecap="round"
            fill="#7B3F00"
          />
          {/* tongue */}
          <path d="M45 68 Q50 73 55 68" fill="#FF6B6B" opacity="0.8" />
        </>
      ) : (
        <path
          d="M43 65 Q50 71 57 65"
          stroke="#7B3F00"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* TOP SHINE — gives 3D feel */}
      <ellipse cx="42" cy="28" rx="8" ry="4" fill="white" opacity="0.6" />
      <ellipse cx="60" cy="30" rx="4" ry="2" fill="white" opacity="0.45" />
    </svg>
  );
}

// ── Tiny chef hat that sits on top of Foodie (now smaller, optional) ────────
function ChefHat() {
  return (
    <svg width="34" height="20" viewBox="0 0 38 22" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hatGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="#F3F4F6" />
        </linearGradient>
      </defs>
      <ellipse cx="10" cy="9" rx="7" ry="7" fill="url(#hatGrad)" stroke="#D1D5DB" strokeWidth="0.8" />
      <ellipse cx="28" cy="9" rx="7" ry="7" fill="url(#hatGrad)" stroke="#D1D5DB" strokeWidth="0.8" />
      <ellipse cx="19" cy="6" rx="9" ry="6" fill="url(#hatGrad)" stroke="#D1D5DB" strokeWidth="0.8" />
      <rect x="6" y="14" width="26" height="6" rx="1.5" fill="url(#hatGrad)" stroke="#D1D5DB" strokeWidth="0.8" />
    </svg>
  );
}
