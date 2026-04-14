import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <img src="/logo.png" alt="Dromos" className="w-10 h-10 rounded-xl object-cover" />
        <div className="flex items-center gap-3">
          <Link href="/signin" className="text-gray-400 text-sm font-medium hover:text-white transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-500 transition-colors">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-2xl mx-auto">
        <div className="mb-6">
          <img src="/logo.png" alt="Dromos" className="w-24 h-24 rounded-3xl mx-auto mb-6 object-cover shadow-2xl" />
          <h1 className="text-white text-4xl font-extrabold leading-tight mb-4">
            Train smarter.<br />Race faster.
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Dromos builds your personalised training plan using AI — then adapts it daily based on your recovery, sleep, and how you feel.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full max-w-xs">
          <Link href="/signup" className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-bold text-base text-center hover:bg-blue-500 transition-colors">
            Start for free →
          </Link>
          <Link href="/signin" className="flex-1 py-4 rounded-2xl bg-gray-800 text-gray-300 font-bold text-base text-center hover:bg-gray-700 transition-colors">
            Sign in
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 w-full max-w-2xl text-left">
          {[
            { icon: '🤖', title: 'AI Coach', desc: 'Daily personalised workout guidance based on your check-in data' },
            { icon: '📅', title: 'Smart Plans', desc: 'Race-date-relative phases — Base, Build, Specific, Taper' },
            { icon: '⚡', title: 'Strava Sync', desc: 'Auto-import your runs and rides, matched to your training plan' },
          ].map(f => (
            <div key={f.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-center py-6 text-gray-700 text-xs">
        © {new Date().getFullYear()} Dromos · dromosrun.app
      </footer>
    </div>
  );
}
