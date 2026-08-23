import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-sm',
          {
            'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 hover:shadow-md': variant === 'primary',
            'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus:ring-slate-500': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 hover:shadow-md': variant === 'danger',
            'bg-transparent hover:bg-slate-100 text-slate-700 focus:ring-slate-500 shadow-none': variant === 'ghost',
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-5 py-2.5 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
