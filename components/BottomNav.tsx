'use client';

import { useState } from 'react';
import Link from 'next/link';

type Tab = 'today' | 'week' | 'sessions' | 'more';

interface NavItem {
  id: Tab;
  href: string;
  label: string;
  icon: JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'today',
    href: '/',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    id: 'week',
    href: '/week',
    label: 'Week',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'sessions',
    href: '/sessions',
    label: 'Sessions',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
];

export default function BottomNav({ active }: { active: Tab }) {
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-md mx-auto flex">

          {/* ── Existing 3 tabs ── */}
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                  isActive ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                {item.icon}
                <span className={`text-xs font-medium ${isActive ? 'text-blue-400' : 'text-gray-500'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* ── More button ── */}
          <button
            onClick={() => setShowMoreSheet(true)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              active === 'more' ? 'text-blue-400' : 'text-gray-500'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
            </svg>
            <span className={`text-xs font-medium ${active === 'more' ? 'text-blue-400' : 'text-gray-500'}`}>
              More
            </span>
          </button>

        </div>
      </nav>

      {/* ── More sheet ── */}
      {showMoreSheet && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setShowMoreSheet(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">More</span>
              <button
                onClick={() => setShowMoreSheet(false)}
                className="text-gray-500 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Links */}
            {[
              {
                href: '/history',
                label: 'History',
                sub: 'Past sessions and trends',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                ),
              },
              {
                href: '/tests',
                label: 'Tests',
                sub: 'Fitness benchmarks',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 20h.01M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>
                  </svg>
                ),
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setShowMoreSheet(false)}
                className="flex items-center gap-3 px-5 py-4 active:bg-gray-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm font-semibold">{item.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{item.sub}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
