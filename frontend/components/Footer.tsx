import Link from 'next/link';
import { Mail, MapPin } from 'lucide-react';
import Logo from './Logo';
import { FOOTER_COLS, SITE } from '@/lib/site';

function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V10.5H5.67v7.84h2.67zM7 9.34a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9V14a3.34 3.34 0 0 0-3.34-3.5 2.92 2.92 0 0 0-2.63 1.45V10.5H9.7v7.84h2.67v-4.34c0-1.15.22-2.26 1.65-2.26 1.41 0 1.43 1.32 1.43 2.34v4.26h2.89z" />
    </svg>
  );
}

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
    </svg>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <div className="container-tad py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="text-brand-600">
              <Logo />
            </Link>
            <p className="mt-4 max-w-sm text-sm text-ink-600">
              Subscriptions to TAD MCP for Revit, TAD MCP for AutoCAD, and the
              TAD Platform. Manage your seats and billing in one place.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-ink-600">
              <li className="flex items-center gap-2">
                <Mail size={16} aria-hidden="true" />
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="hover:text-ink-900"
                >
                  {SITE.contactEmail}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin size={16} aria-hidden="true" />
                <span>{SITE.address}</span>
              </li>
            </ul>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-ink-700 hover:text-ink-900"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-ink-200 pt-8 md:flex-row md:items-center">
          <div className="flex items-center gap-3 text-xs text-ink-500">
            <span className="rounded-full border border-ink-200 bg-white px-3 py-1 font-medium text-ink-700">
              Autodesk Developer
            </span>
            <span className="rounded-full border border-ink-200 bg-white px-3 py-1 font-medium text-ink-700">
              Anthropic MCP
            </span>
          </div>
          <div className="flex items-center gap-4 text-ink-500">
            <a
              href={SITE.socials.linkedin}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="LinkedIn"
              className="hover:text-ink-900"
            >
              <LinkedinIcon />
            </a>
            <a
              href={SITE.socials.youtube}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="YouTube"
              className="hover:text-ink-900"
            >
              <YoutubeIcon />
            </a>
          </div>
          <p className="text-xs text-ink-500">
            © {year.toString()} {SITE.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
