# next-saas-settings-noop-save

ISSUE: Settings "Save Changes" button has no handler — clicking it does nothing (no API call, no state change, no URL change).

Expected: Turpan should detect that clicking "Save Changes" causes no URL or DOM change, flagging it as a medium severity finding.
