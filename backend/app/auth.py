import os
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

# This is where your Supabase JWT secret will be stored.
# Go to your Supabase project > Settings > API > JWT Settings and copy the secret.
# Add it to your .env file as SUPABASE_JWT_SECRET="your-secret-key"
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"
AUDIENCE = "authenticated"

# This dependency will look for the token in the Authorization header.
# However, for our websocket, we'll pass it as a query parameter.
# For HTTP routes, we'll need to adjust the client to send it in the header.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl is not used in our case

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        if not JWT_SECRET:
            raise JWTError("Supabase JWT Secret not configured.")

        payload = jwt.decode(
            token, 
            JWT_SECRET, 
            algorithms=[ALGORITHM],
            audience=AUDIENCE
        )
        
        # You can add more checks here, e.g., for scopes or other claims
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        return {"user_id": user_id, "payload": payload}

    except JWTError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception
