import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import api from '../api';
import toast from 'react-hot-toast';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from '../components/FieldError';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setToken, setRole, setUser } = useAuthStore();
  const { errors, handleBlur, handleChange, validateForm } = useFormValidation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) {
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.access_token);
      setRole(data.role);
      setUser({ id: data.user_id, email });
      toast.success('Login successful');
      if (data.must_change_password) {
        toast.error('You must change your password before continuing.', { duration: 5000 });
        navigate('/settings');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
        
        {/* Sanken Official Overlapping Diamonds Brand Mark Render */}
        <div className="flex flex-col items-center justify-center mb-8 select-none">
          <div className="relative w-16 h-10 mb-2.5 flex items-center justify-center">
            {/* Diamond 1 - Sanken Royal Blue */}
            <div className="absolute left-[3px] w-[22px] h-[22px] bg-sky-600 rotate-45 rounded-xs shadow-sm border border-white/20" />
            {/* Diamond 2 - Sanken Sky Blue */}
            <div className="absolute left-[16px] w-[22px] h-[22px] bg-sky-500 rotate-45 opacity-95 rounded-xs shadow-sm border border-white/10" />
            {/* Diamond 3 - Sanken Ice Blue */}
            <div className="absolute left-[29px] w-[22px] h-[22px] bg-sky-200 rotate-45 opacity-85 rounded-xs shadow-xs border border-white/5" />
          </div>
          
          <div className="text-center leading-none">
            <h1 className="text-2xl font-black text-[#111111] tracking-tight font-display">Sanken</h1>
            <p className="text-[10px] font-bold text-slate-500 tracking-[0.25em] uppercase mt-1.5 font-sans">Overseas</p>
            <div className="inline-flex mt-2.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-50 border border-sky-150 text-sky-700 tracking-wider">
              SKOA Air Portal
            </div>
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input 
              name="email"
              type="email" 
              placeholder="name@sanken.com" 
              value={email} 
              onChange={(e) => {
                setEmail(e.target.value);
                handleChange(e);
              }}
              onBlur={handleBlur}
              required 
              className={`w-full p-3 border ${errors.email ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all`} 
            />
            <FieldError error={errors.email} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input 
                name="password"
                type={showPassword ? 'text' : 'password'} 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  handleChange(e);
                }}
                onBlur={handleBlur}
                required 
                className={`w-full p-3 pr-12 border ${errors.password ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all`} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-800 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <FieldError error={errors.password} />
          </div>
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full p-3 bg-sky-500 hover:bg-sky-600 text-slate-50 font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 animate-feed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>


      </div>
    </div>
  );
}
