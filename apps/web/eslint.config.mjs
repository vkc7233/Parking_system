import config from '@parking/eslint-config';

export default [...config, { ignores: ['.next/**', '.next-dev/**'] }];
