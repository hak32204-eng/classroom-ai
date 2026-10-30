// Node tests execute the real OAuth library. Only the workerd entrypoint base is
// shimmed; full workerd deployment remains a separate validation step.
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers') return {url:'data:text/javascript,export class WorkerEntrypoint {}',shortCircuit:true};
  return next(specifier,context);
}});
