import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Send, User, ShieldCheck } from 'lucide-react';
import { useSiteContext } from '../../context/SiteContext';

interface ChatMessage {
    id: number;
    sender_role: 'company' | 'admin';
    sender_name: string;
    content: string;
    created_at: string;
}

export default function CompanyMessages() {
    const { token, user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const { flattenedSettings } = useSiteContext();

    const chatEndRef = useRef<HTMLDivElement>(null);

    const fetchMessages = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/company/messages', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setMessages(json.data);
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to fetch communications thread.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();

        // Auto-polling messages every 6 seconds for dynamic chat feel
        const interval = setInterval(fetchMessages, 6000);
        return () => clearInterval(interval);
    }, [token]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || sending) return;

        setSending(true);
        setError('');

        try {
            const res = await fetch('http://localhost:5000/api/company/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ content: inputText })
            });
            const json = await res.json();

            if (json.success) {
                setInputText('');
                fetchMessages();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Message dispatch failed.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn max-w-4xl h-[calc(100vh-140px)] flex flex-col justify-between">
            {/* Title */}
            <div className="shrink-0">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Support Desk</h1>
                <p className="text-zinc-500 text-sm mt-1">Communicate directly with {flattenedSettings.company_name || 'TekDoctor'} technical administrators concerning asset contracts.</p>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-medium animate-fadeIn shrink-0">
                    {error}
                </div>
            )}

            {/* Chat Thread */}
            <div className="flex-1 bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl p-4 md:p-6 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-zinc-800">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
                        <MessageSquare size={32} className="text-zinc-700 animate-bounce" />
                        <div className="space-y-1">
                            <h3 className="text-zinc-300 font-bold text-sm">No Messages Thread</h3>
                            <p className="text-zinc-650 text-xs max-w-xs">Start a support ticket or dispatch general queries to systems administration.</p>
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.sender_role === 'company';
                        return (
                            <div
                                key={msg.id}
                                className={`flex gap-3 max-w-[80%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                            >
                                {/* Avatar Icon */}
                                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white ${isMe ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-zinc-800'
                                    }`}>
                                    {isMe ? <User size={14} /> : <ShieldCheck size={14} className="text-indigo-400" />}
                                </div>

                                {/* Message Body */}
                                <div className="space-y-1">
                                    <div className={`text-[10px] text-zinc-550 font-semibold font-mono ${isMe ? 'text-right' : ''}`}>
                                        {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${isMe
                                        ? 'bg-indigo-600 text-white rounded-tr-none'
                                        : 'bg-zinc-900 text-zinc-300 rounded-tl-none border border-zinc-800/80'
                                        }`}>
                                        {msg.content}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={chatEndRef}></div>
            </div>

            {/* Input dispatch bar */}
            <form onSubmit={handleSend} className="shrink-0 flex gap-2">
                <input
                    type="text"
                    placeholder="Write your support message..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    className="flex-1 bg-[#0c0c0c] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                    disabled={loading || sending}
                />
                <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-805 text-white p-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 cursor-pointer flex items-center justify-center font-bold"
                    disabled={!inputText.trim() || sending}
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
