// server/src/components/ui/Button.tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background relative',
  {
    variants: {
      variant: {
        default: 'bg-[rgb(var(--color-primary-500))] text-white hover:bg-[rgb(var(--color-primary-600))]',
        destructive: 'bg-[rgb(var(--color-accent-500))] text-white hover:bg-[rgb(var(--color-accent-600))]',
        outline: 'border border-[rgb(var(--color-border-400))] text-[rgb(var(--color-text-700))] hover:bg-[rgb(var(--color-primary-50))] hover:text-[rgb(var(--color-primary-700))]',
        secondary: 'bg-[rgb(var(--color-secondary-500))] text-white hover:bg-[rgb(var(--color-secondary-600))]',
        ghost: 'text-[rgb(var(--color-text-700))] hover:bg-[rgb(var(--color-primary-50))] hover:text-[rgb(var(--color-primary-700))]',
        link: 'underline-offset-4 hover:underline text-[rgb(var(--color-primary-500))]',
        soft: 'bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary-700))] hover:bg-[rgb(var(--color-primary-200))]',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
      },
      tooltip: {
        true: 'group',
        false: '',
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      tooltip: false
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tooltipText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, tooltipText, tooltip, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const buttonRef = React.useRef<HTMLButtonElement | null>(null)
    const [tooltipPosition, setTooltipPosition] = React.useState({ x: 0, y: 0 })

    React.useEffect(() => {
      if (tooltipText && buttonRef.current) {
        const button = buttonRef.current
        const handleMouseEnter = () => {
          const rect = button.getBoundingClientRect()
          setTooltipPosition({
            x: rect.left + rect.width / 2,
            y: rect.top
          })
        }
        
        button.addEventListener('mouseenter', handleMouseEnter)
        return () => button.removeEventListener('mouseenter', handleMouseEnter)
      }
    }, [tooltipText])

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, tooltip, className }),
          'group'
        )}
        ref={(node) => {
          if (typeof ref === 'function') {
            ref(node)
          } else if (ref) {
            ref.current = node
          }
            buttonRef.current = node
        }}
        {...props}
      >
        {props.children}
        {tooltipText && (
          <span 
            className="fixed invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity
            bg-white px-2 py-1 rounded-md text-gray-900 text-xs whitespace-nowrap
            shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.14)]
            border border-[rgba(0,0,0,0.05)]
            z-[9999]"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: 'translate(-50%, -100%) translateY(-8px)'
            }}
          >
            {tooltipText}
          </span>
        )}
      </Comp>
    )
  }
)

Button.displayName = 'Button'

export { Button, buttonVariants }
