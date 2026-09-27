import { useState } from 'react'

export default function PasswordField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = '',
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="password-field">
      <span>{label}</span>
      <span className="password-field-control">
        <input
          type={visible ? 'text' : 'password'}
          aria-label={label ? undefined : placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? '隐藏密码' : '显示密码'}
          title={visible ? '隐藏密码' : '显示密码'}
        >
          {visible ? '隐藏' : '显示'}
        </button>
      </span>
    </label>
  )
}
