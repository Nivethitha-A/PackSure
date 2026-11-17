import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'models/**/*', 'uploads/**/*', 'data/**/*', 'inference_service/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
