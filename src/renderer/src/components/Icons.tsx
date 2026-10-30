import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps): IconProps => ({
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...props
})

export const IconGetMail = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11" />
    <path d="M7 11l5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
)

export const IconReply = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 8l-6 4 6 4" />
    <path d="M4 12h9a6 6 0 0 1 6 6v1" />
  </svg>
)

export const IconReplyAll = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 8l-6 4 6 4" />
    <path d="M7 8l-6 4 6 4" />
    <path d="M7 12h9a6 6 0 0 1 6 6v1" />
  </svg>
)

export const IconForward = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 8l6 4-6 4" />
    <path d="M20 12H11a6 6 0 0 0-6 6v1" />
  </svg>
)

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 7h14" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 13h8l1-13" />
  </svg>
)

export const IconArchive = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="4" rx="1" />
    <path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    <path d="M10 13h4" />
  </svg>
)

export const IconFlagFilled = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 3v18" strokeWidth={0} />
    <path d="M6 4h12l-3 4 3 4H6z" />
  </svg>
)

export const IconFlagOutline = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3v18" />
    <path d="M6 4h12l-3 4 3 4H6z" />
  </svg>
)

export const IconCompose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13 7l4 4" />
  </svg>
)

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
)

export const IconPaperclip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 8.5l-8 8a3 3 0 1 1-4-4l8-8a2 2 0 1 1 3 3l-7.5 7.5" />
  </svg>
)

export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const IconInbox = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12l2-7h12l2 7" />
    <path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
    <path d="M4 12h4l2 3h4l2-3h4" />
  </svg>
)

export const IconSent = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 11l16-7-6 16-3-6-7-3z" />
  </svg>
)

export const IconDraft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 17l1-4 10-10 3 3-10 10-4 1z" />
  </svg>
)

export const IconJunk = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
)

export const IconMailbox = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="6" width="16" height="13" rx="2" />
    <path d="M4 8l8 6 8-6" />
  </svg>
)

export const IconStar = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.5l6.4-.6z" />
  </svg>
)

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 14.5l5-5" />
    <path d="M11 7l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12" />
    <path d="M13 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12" />
  </svg>
)

export const IconBulletList = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
    <path d="M9 7h11M9 12h11M9 17h11" />
  </svg>
)

export const IconNumberedList = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 7h11M9 12h11M9 17h11" />
    <text x="2" y="9" fontSize="7" fill="currentColor" stroke="none">
      1
    </text>
    <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">
      2
    </text>
    <text x="2" y="19" fontSize="7" fill="currentColor" stroke="none">
      3
    </text>
  </svg>
)

export const IconClearFormat = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 5h13" />
    <path d="M10 5l2 14" />
    <path d="M6 19l12-12" />
  </svg>
)

export const IconGear = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v2.4M12 18.1v2.4M4.9 6.5l1.7 1.7M17.4 15.8l1.7 1.7M3.5 12h2.4M18.1 12h2.4M4.9 17.5l1.7-1.7M17.4 8.2l1.7-1.7" />
  </svg>
)

export const IconPerson = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
  </svg>
)

export const IconFolderPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M12 12v5M9.5 14.5h5" />
  </svg>
)

export const IconPencil = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h4L18 10l-4-4L4 16v4z" />
  </svg>
)

export const IconSidebar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </svg>
)
