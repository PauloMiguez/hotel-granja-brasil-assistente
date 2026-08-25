import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'whatsapp' | 'outline';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, className = '', ...props }) => {
  const base = 'px-4 py-2 rounded-full font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<'primary' | 'whatsapp' | 'outline', string> = {
    primary: 'bg-[#075e54] text-white hover:bg-[#128c7e]',
    whatsapp: 'bg-[#25d366] text-white hover:bg-[#20b858]',
    outline: 'border border-gray-300 hover:bg-gray-100',
  };
  return (
    <button className={`${base} ${variants[variant as keyof typeof variants]} ${className}`} {...props}>
      {children}
    </button>
  );
};