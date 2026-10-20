import { main } from './cli';

main(process.argv.slice(2)).then((code) => process.exit(code));
