"""
POC mínimo: ¿la PEM y el Application ID son válidos?
Llama GET /aspsps?country=ES y devuelve la lista de bancos disponibles.
Si funciona, vemos Kutxabank y Santander en la respuesta.
"""
import os
import jwt as pyjwt
import time
import requests
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["ENABLE_BANKING_APPLICATION_ID"]
PRIVATE_KEY = os.environ["ENABLE_BANKING_JWT_PRIVATE_KEY"]
API_BASE = "https://api.enablebanking.com"

def make_jwt() -> str:
    now = int(time.time())
    payload = {
        "iss": "enablebanking.com",
        "aud": "api.enablebanking.com",
        "iat": now,
        "exp": now + 3600,
    }
    return pyjwt.encode(
        payload,
        PRIVATE_KEY,
        algorithm="RS256",
        headers={"kid": APP_ID, "typ": "JWT"},
    )

def main():
    token = make_jwt()
    print(f"JWT generado, length={len(token)}")

    # Endpoint público que requiere auth
    r = requests.get(
        f"{API_BASE}/application",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    print(f"GET /application → {r.status_code}")
    if r.status_code == 200:
        print("✅ Auth correcto. Detalles app:")
        print(r.json())
    else:
        print(f"❌ Error: {r.text}")
        return

    # Listar bancos España
    r = requests.get(
        f"{API_BASE}/aspsps?country=ES",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    print(f"\nGET /aspsps?country=ES → {r.status_code}")
    if r.status_code == 200:
        aspsps = r.json().get("aspsps", [])
        print(f"✅ {len(aspsps)} ASPSPs en ES")
        for a in aspsps:
            if any(name in a.get("name", "").lower() for name in ["kutxa", "santander"]):
                print(f"   • {a.get('name')} · {a.get('country')} · psu_types={a.get('psu_types')}")

if __name__ == "__main__":
    main()
