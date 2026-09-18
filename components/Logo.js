import Image from "next/image"

export default function Logo({ size = 20, className = "" }) {
  return (
    <Image
      src="/logo.svg"
      alt="Kineva"
      width={size}
      height={size}
      className={`flex-shrink-0 ${className}`}
    />
  )
}
