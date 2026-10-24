import { Field } from '../../components/ui';

export function CardFields({
  front,
  back,
  disabled = false,
  onChange,
}: {
  front: string;
  back: string;
  disabled?: boolean;
  onChange: (value: { front: string; back: string }) => void;
}) {
  return (
    <>
      <Field label="Лицевая сторона · вопрос">
        <textarea
          required
          maxLength={20000}
          disabled={disabled}
          value={front}
          onChange={(e) => onChange({ front: e.target.value, back })}
        />
      </Field>
      <Field label="Обратная сторона · ответ">
        <textarea
          required
          maxLength={20000}
          disabled={disabled}
          value={back}
          onChange={(e) => onChange({ front, back: e.target.value })}
        />
      </Field>
    </>
  );
}
