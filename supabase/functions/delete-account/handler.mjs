const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function createDeleteAccountHandler({createClient, getEnv, logger=console}) {
  const respond=(status,body)=>Response.json(body,{status,headers:corsHeaders});
  const blocked=()=>respond(409,{error:'Account deletion is unavailable during an ownership handover. Try again after it finishes.'});
  return async function deleteAccount(req) {
    if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
    if(req.method!=='POST')return respond(405,{error:'Method not allowed.'});
    try {
      const authHeader=req.headers.get('Authorization');
      if(!authHeader?.startsWith('Bearer '))return respond(401,{error:'Authentication required.'});
      const url=getEnv('SUPABASE_URL'),anon=getEnv('SUPABASE_ANON_KEY'),service=getEnv('SUPABASE_SERVICE_ROLE_KEY');
      if(!url||!anon||!service)return respond(500,{error:'Server configuration error.'});
      const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await userClient.auth.getUser();
      const user=data?.user;
      if(error||!user?.id)return respond(401,{error:'Invalid or expired authentication session.'});
      const preparation=await userClient.rpc('honorpole_prepare_account_deletion_r1');
      if(preparation.error?.code==='HP409')return blocked();
      if(preparation.error?.code==='HP401')return respond(401,{error:'Invalid or expired authentication session.'});
      if(preparation.error||preparation.data?.ready!==true||preparation.data?.userId!==user.id)
        return respond(503,{error:'Account deletion is temporarily unavailable. Try again.'});
      const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
      // Do not delete tokens or memberships before this call. Verified foreign
      // keys cascade inside Auth's transaction; the Auth guard can roll it all back.
      const deleted=await admin.auth.admin.deleteUser(user.id,false);
      if(deleted.error) {
        // A concurrent freeze can win after preflight. Recheck for a clear 409;
        // otherwise report uncertainty, never claim successful account deletion.
        const latest=await userClient.rpc('honorpole_prepare_account_deletion_r1');
        if(latest.error?.code==='HP409')return blocked();
        logger.error('Account deletion could not be confirmed.');
        return respond(503,{error:'Unable to confirm account deletion. Try signing in again before retrying.'});
      }
      return respond(200,{success:true,message:'Account deleted.'});
    } catch {
      logger.error('Account deletion request failed.');
      return respond(503,{error:'Unable to confirm account deletion. Try signing in again before retrying.'});
    }
  };
}
