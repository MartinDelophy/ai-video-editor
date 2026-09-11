# Draft restore and installation re-enable undeclared Agent grants

Hi Anna team — Timeline Studio's WASM, production source-audio MP4 and strict validation now pass. A separate permissions issue remains.

**September 11, 2026 · app 254 · CLI 0.1.52 · SDK 0.16.1**

| Case | Manifest Agent session | Save all result |
| --- | --- | --- |
| r8 | Not declared | `manifest does not declare agent.session.auto` |
| r9 | `{"auto":true}` | `manifest does not declare agent.session.fixed` |
| r11 | `{"auto":true,"fixed":{}}` | Success |

In r11, unchecking auto, fixed and inherit-tools also saved successfully. `getAppPermissions` confirmed all three false; LLM complete and Storage remained enabled.

We restored the no-Agent manifest, pushed **r12 ready** with the exact verified r8 content, and clicked **Install draft**. Read-back at **10:47:37.435 UTC** showed:

```json
{"declared_session":{"auto":false,"fixed":false},"stored_agent":{"auto":true,"fixed":true},"inherit_host_tools":true}
```

These are sanitized summary fields. `satisfied` remained true. The r12 dialog showed only LLM/Storage checked, no Agent controls. Saving unchanged settings again failed: `Save failed: manifest does not declare agent.session.auto`.

We read grants before the restore push and after installation, **not between those steps**. The push-plus-install flow re-enabled the grants; the exact backend step is not isolated. Ordinary end-user installations were not tested.

Separately, [installed-apps.js](https://anna.partners/static/js/installed-apps.js?v=81832387) `collectAppUpdate` (1091–1099) copies previous Agent values and updates only declared modes. Executing the original function in isolation preserves hidden true values; actual production PATCH bodies were not intercepted.

Could you investigate this reset and clear/filter undeclared modes when collecting permission updates? UI cleanup does not survive this flow.

Current r12 has no Agent declaration. No review or public release was submitted.
