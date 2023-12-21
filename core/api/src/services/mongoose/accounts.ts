import { parseRepositoryError } from "./utils"

import { AccountStatus } from "@/domain/accounts"
import {
  CouldNotFindAccountError,
  CouldNotFindAccountFromKratosIdError,
  CouldNotFindAccountFromUsernameError,
  CouldNotFindAccountFromIdError,
  RepositoryError,
} from "@/domain/errors"
import { UsdDisplayCurrency } from "@/domain/fiat"

import { Account } from "@/services/mongoose/schema"

const caseInsensitiveRegex = (input: string) => {
  return new RegExp(`^${input}$`, "i")
}

export const AccountsRepository = (): IAccountsRepository => {
  const listUnlockedAccounts = async function* ():
    | AsyncGenerator<Account>
    | RepositoryError {
    let accounts
    try {
      accounts = Account.find({
        $expr: { $eq: [{ $last: "$statusHistory.status" }, AccountStatus.Active] },
      })
    } catch (err) {
      return parseRepositoryError(err)
    }

    for await (const account of accounts) {
      yield translateToAccount(account)
    }
  }

  const findById = async (accountId: AccountId): Promise<Account | RepositoryError> => {
    try {
      const result = await Account.findOne({
        id: accountId,
      })
      if (!result) return new CouldNotFindAccountFromIdError(accountId)
      return translateToAccount(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findByUsername = async (
    username: Username,
  ): Promise<Account | RepositoryError> => {
    try {
      const result = await Account.findOne({ username: caseInsensitiveRegex(username) })
      if (!result) {
        return new CouldNotFindAccountFromUsernameError(username)
      }
      return translateToAccount(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  // FIXME: could be in a different file? does not return an Account
  const listBusinessesForMap = async (): Promise<
    BusinessMapMarker[] | RepositoryError
  > => {
    try {
      const accounts = await Account.find(
        {
          title: { $exists: true, $ne: undefined },
          coordinates: { $exists: true, $ne: undefined },
        },
        { username: 1, title: 1, coordinates: 1 },
      )

      if (!accounts) {
        return new CouldNotFindAccountError()
      }

      return accounts.map((account) => ({
        username: account.username as Username,
        mapInfo: {
          title: account.title as BusinessMapTitle,
          coordinates: account.coordinates as Coordinates,
        },
      }))
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const update = async ({
    id,
    level,
    statusHistory,
    coordinates,
    contactEnabled,
    contacts,
    title,
    username,
    defaultWalletId,
    withdrawFee,
    kratosUserId,
    displayCurrency,
    notificationSettings,

    role,
  }: Account): Promise<Account | RepositoryError> => {
    try {
      const result = await Account.findOneAndUpdate(
        { id },
        {
          level,
          statusHistory,
          coordinates,
          title,
          username,
          contactEnabled,
          contacts: contacts.map(
            ({ username, alias, transactionsCount }: AccountContact) => ({
              id: username,
              name: alias,
              transactionsCount,
            }),
          ),
          defaultWalletId,
          withdrawFee,
          kratosUserId,
          displayCurrency,
          notificationSettings,

          role,
        },
        {
          new: true,
        },
      )
      if (!result) {
        return new RepositoryError("Couldn't update account")
      }
      return translateToAccount(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const persistNew = async (kratosUserId: UserId): Promise<Account | RepositoryError> => {
    try {
      const account = new Account()
      account.kratosUserId = kratosUserId
      await account.save()
      return translateToAccount(account)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findByUserId = async (
    kratosUserId: UserId,
  ): Promise<Account | RepositoryError> => {
    try {
      const result = await Account.findOne({ kratosUserId: { $eq: kratosUserId } })

      if (!result) {
        return new CouldNotFindAccountFromKratosIdError(kratosUserId)
      }

      return translateToAccount(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    persistNew,
    findByUserId,
    listUnlockedAccounts,
    findById,
    findByUsername,
    listBusinessesForMap,
    update,
  }
}

const translateToAccount = (result: AccountRecord): Account => ({
  id: result.id as AccountId,
  createdAt: new Date(result.created_at),
  defaultWalletId: result.defaultWalletId as WalletId,
  username: result.username as Username,
  level: result.level as AccountLevel,
  status: result.statusHistory.slice(-1)[0].status,
  statusHistory: (result.statusHistory || []) as AccountStatusHistory,
  title: result.title as BusinessMapTitle,
  coordinates: result.coordinates as Coordinates,
  contactEnabled: !!result.contactEnabled,
  contacts: result.contacts.reduce(
    (res: AccountContact[], contact: ContactObjectForUser): AccountContact[] => {
      if (contact.id) {
        res.push({
          id: contact.id as Username,
          username: contact.id as Username,
          alias: (contact.name || contact.id) as ContactAlias,
          transactionsCount: contact.transactionsCount,
        })
      }
      return res
    },
    [],
  ),
  withdrawFee: result.withdrawFee as Satoshis,
  notificationSettings: {
    push: {
      enabled: result.notificationSettings
        ? result.notificationSettings.push.enabled
        : true,
      disabledCategories: result.notificationSettings?.push?.disabledCategories || [],
    },
  },

  kratosUserId: result.kratosUserId as UserId,
  displayCurrency: (result.displayCurrency || UsdDisplayCurrency) as DisplayCurrency,
})
