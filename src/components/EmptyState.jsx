export default function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  actionIcon: ActionIcon,
  disabled = false,
  onAction,
}) {
  return (
    <div className="grid place-items-center px-5 py-10 text-center">
      <div className="max-w-md">
        {Icon && (
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/5 text-teal-200">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {body && <p className="mt-2 text-sm leading-6 text-neutral-400">{body}</p>}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            {ActionIcon && <ActionIcon className="h-4 w-4" />}
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
