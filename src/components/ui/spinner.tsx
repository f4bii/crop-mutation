import { Loader2Icon } from 'lucide-react'

import { twMerge } from 'tailwind-merge'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={twMerge('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
