import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

export default Extension.define({
  id: "agent",
  stores: {
    preferences: Store.global(
      Schema.Struct({ responseLanguage: Schema.String }),
      { responseLanguage: "" },
      {
        key: "settings.v3",
        pick: (value: { general?: { responseLanguage?: unknown } } | null) => {
          const responseLanguage = value?.general?.responseLanguage

          return responseLanguage === undefined ? undefined : { responseLanguage }
        },
      },
    ),
  },
  i18n: { en },
})
