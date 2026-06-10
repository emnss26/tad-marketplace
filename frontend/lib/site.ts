/**
 * Site-wide constants. Single source of truth for marketplace-facing copy,
 * URLs, and the cross-property links back to `tad.com.mx`.
 */
export const SITE = {
  name: 'TAD',
  domain: 'marketplace.tad.com.mx',
  url: 'https://marketplace.tad.com.mx',
  landingUrl: 'https://tad.com.mx',
  platformUrl: 'https://platform.tad.com.mx',
  contactEmail: 'taller.arq.dgtl@gmail.com',
  address: 'Mexico City, Mexico',
  socials: {
    linkedin: 'https://www.linkedin.com/in/taller-de-arquitectura-digital-363726185/',
    youtube: 'https://www.youtube.com/@tallerdearquitecturadigita3141',
  },
} as const;

/**
 * Primary nav.
 */
export const NAV: readonly { label: string; href: string }[] = [
  { label: 'Products', href: '/products' },
];

export const FOOTER_COLS = [
  {
    title: 'Products',
    links: [
      { label: 'TAD MCP for Revit', href: `${SITE.landingUrl}/mcps`, external: true },
      { label: 'TAD MCP for AutoCAD', href: `${SITE.landingUrl}/mcps`, external: true },
      { label: 'TAD Platform', href: SITE.platformUrl, external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: `${SITE.landingUrl}/about`, external: true },
      { label: 'Contact', href: `${SITE.landingUrl}/contact`, external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      {
        label: 'Privacy Policy',
        href: `${SITE.landingUrl}/legal/tad-mcp-privacy`,
        external: true,
      },
      { label: 'EULA', href: `${SITE.landingUrl}/legal/tad-mcp-eula`, external: true },
    ],
  },
] as const;
