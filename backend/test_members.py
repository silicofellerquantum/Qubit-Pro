import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(base_url="http://localhost:5000") as client:
        # Create a user
        res = await client.post("/api/auth/register", json={
            "email": "test_members_err@example.com",
            "password": "password",
            "name": "Test"
        })
        token = ""
        if res.status_code == 201:
            token = res.json().get("access_token")
        else:
            # Maybe already exists, try login
            res = await client.post("/api/auth/login", data={
                "username": "test_members_err@example.com",
                "password": "password"
            })
            token = res.json().get("access_token")

        if not token:
            print("Failed to get token")
            return

        res = await client.get("/api/team/members", headers={"Authorization": f"Bearer {token}"})
        print(res.status_code)
        print(res.text)

if __name__ == "__main__":
    asyncio.run(main())
