// app/login/page.tsx
export default function LoginPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-sm">
        
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">Welcome Back</h2>
          <p className="mt-2 text-sm text-slate-400">Please enter your credentials to access your vault.</p>
        </div>

        <form className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Email Address</label>
              <input 
                type="email" 
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <input 
                type="password" 
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white transition-all hover:bg-blue-700 active:scale-[0.98]"
          >
            Sign In to Vault
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Secure 256-bit AES Encrypted Connection
        </p>
      </div>
    </div>
  );
}