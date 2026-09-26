module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'src/**/*_backup.jsx', 'worker', 'docs/archive'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  overrides: [
    {
      files: ['src/pages/**/*.{js,jsx}', 'src/components/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['**/supabase', '**/supabase.js', '@supabase/supabase-js', '@supabase/supabase-js/**'],
            message: '页面和组件通过业务 hook 或 backend 调用服务，不直接操作 Supabase。',
          }],
        }],
      },
    },
    {
      files: ['src/lib/**/*.{js,jsx}', 'src/data/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['**/pages/**', '**/components/**', '**/hooks/**', '**/context/**', 'react', 'react/**', 'react-dom', 'react-dom/**', 'react-router-dom', 'react-router-dom/**'],
            message: '底层逻辑和数据不依赖页面、组件、hook 或 React；由上层注入所需行为。',
          }],
        }],
      },
    },
  ],
  rules: {
    'react/prop-types': 'off',
    'react/jsx-no-target-blank': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
