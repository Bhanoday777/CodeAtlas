// Inline SVG icons: 16px grid, 1.5px stroke, colored by currentColor.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function LogoMark(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path d="M10 4.5 4.5 14.5M10 4.5l5.5 10M4.5 14.5h11" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <circle cx="10" cy="4.5" r="2.5" fill="currentColor" />
      <circle cx="4.5" cy="14.5" r="2.5" fill="currentColor" />
      <circle cx="15.5" cy="14.5" r="2.5" fill="currentColor" />
    </svg>
  )
}

export function GraphIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="4" cy="4" r="1.75" />
      <circle cx="12" cy="4" r="1.75" />
      <circle cx="8" cy="12" r="1.75" />
      <path d="M5.2 5.3 7 10.4M10.8 5.3 9 10.4M5.75 4h4.5" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </Icon>
  )
}

export function ZoomInIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 8h9" />
    </Icon>
  )
}

export function FitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10" />
    </Icon>
  )
}

export function ResetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8a5 5 0 1 0 1.5-3.55" />
      <path d="M3 2.75v2.5h2.5" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.25 14.25 13.25H1.75Z" />
      <path d="M8 6.5v3M8 11.4v.1" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5v7.5M4.5 6.5 8 10l3.5-3.5M3 13h10" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
    </Icon>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8H3M6.5 4.5 3 8l3.5 3.5" />
    </Icon>
  )
}

export function CubeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5Z" />
      <path d="M2.5 5.1 8 8.25l5.5-3.15M8 8.25v5.75" />
    </Icon>
  )
}

export function EdgesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="3.5" cy="3.5" r="1.5" />
      <circle cx="12.5" cy="12.5" r="1.5" />
      <path d="M4.9 4.9 11.1 11.1" />
      <path d="M8.75 11.5h2.6V8.9" />
    </Icon>
  )
}

export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 2.75h4.25V7M13.25 2.75 7.5 8.5" />
      <path d="M11.5 9.5v3.25a.5.5 0 0 1-.5.5H3.25a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5H6.5" />
    </Icon>
  )
}

export function QuestionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.25 6.25a1.75 1.75 0 1 1 2.6 1.53c-.5.28-.85.67-.85 1.22v.25M8 11.25v.1" />
    </Icon>
  )
}

export function XCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="m10 6-4 4M6 6l4 4" />
    </Icon>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
    </Icon>
  )
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.25 1.75H4.5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5Z" />
      <path d="M9.25 1.75V5h3.25" />
    </Icon>
  )
}
