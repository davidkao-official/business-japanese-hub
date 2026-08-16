import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handlePaypalBrowserReturn } from './handler.ts';

Deno.serve((req) => toResponse(handlePaypalBrowserReturn(toHandlerRequest(req))));
