"use server"
import { createHash } from "crypto"

import { cookies } from "next/headers"

import VerificationForm from "./form"

import MainContent from "@/components/main-container"
import Card from "@/components/card"
import Logo from "@/components/logo"
import { LoginType } from "@/app/types/index.types"

interface VerificationProps {
  login_challenge: string
  email: string
  loginId: string
  remember: string
}

const Verification = async ({ searchParams }: { searchParams: VerificationProps }) => {
  const { login_challenge } = searchParams
  // login_challenge is automatically decoded so we must encode it again to match cookie name
  const cookieStore = cookies().get(
    createHash("md5").update(login_challenge).digest("hex"),
  )

  if (!cookieStore) {
    throw new Error("Cannot find cookies")
  }

  const { loginType, value, remember, loginId } = JSON.parse(cookieStore.value)
  if (!login_challenge || !value || !loginType) {
    throw new Error("Invalid Request")
  }

  if (loginType === LoginType.email && !loginId) {
    throw new Error("Invalid Request for Email")
  }

  return (
    <MainContent>
      <Card>
        <Logo />
        <VerificationForm
          login_challenge={login_challenge}
          loginId={loginId}
          loginType={loginType}
          value={value}
          remember={remember}
        />
      </Card>
    </MainContent>
  )
}

export default Verification
