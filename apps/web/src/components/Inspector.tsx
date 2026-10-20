import { useMemo } from 'react';
import {
  ENTER_PRESETS,
  EASINGS,
  EXIT_PRESETS,
  FONT_FAMILIES,
  TRANSITIONS,
  type Project,
  type Scene,
  type SceneElement,
} from '@frameforge/project-schema';
import { sanitizeHtmlFragment } from '@frameforge/render-core';
import { ColorField, NumberField, Section, SelectField, TextField } from './fields';

type Apply = (fn: (p: Project) => Project, coalesce?: string | null) => void;

interface Props {
  project: Project;
  scene: Scene;
  element: SceneElement | null;
  apply: Apply;
  ops: {
    updateScene(p: Project, id: string, patch: Partial<Omit<Scene, 'id'>>): Project;
    updateElement(p: Project, sid: string, eid: string, patch: Partial<SceneElement>): Project;
  };
}

export function Inspector({ project, scene, element, apply, ops }: Props) {
  const upScene = (patch: Partial<Omit<Scene, 'id'>>, key?: string) =>
    apply((p) => ops.updateScene(p, scene.id, patch), key ? `scene:${scene.id}:${key}` : null);
  const upEl = (patch: Partial<SceneElement>, key?: string) =>
    element && apply((p) => ops.updateElement(p, scene.id, element.id, patch), key ? `el:${element.id}:${key}` : null);
  const htmlWarnings = useMemo(() => (scene.mode === 'html' ? sanitizeHtmlFragment(scene.html).warnings : []), [scene.mode, scene.html]);

  return (
    <div className="inspector">
      <Section title={`Scene: ${scene.name}`} open={!element}>
        <TextField label="Scene name" value={scene.name} maxLength={120} onChange={(v) => upScene({ name: v || 'Scene' }, 'name')} />
        <NumberField
          label="Duration"
          unit="seconds"
          value={scene.durationMs / 1000}
          min={0.1}
          max={600}
          step={0.1}
          onChange={(v) => upScene({ durationMs: Math.round(v * 1000) }, 'dur')}
        />
        <SelectField
          label="Background"
          value={scene.background.type}
          options={[
            { value: 'color', label: 'Solid colour' },
            { value: 'gradient', label: 'Gradient' },
            ...(scene.background.type === 'image' ? [{ value: 'image' as const, label: 'Image (from Media)' }] : []),
          ]}
          onChange={(t) => {
            if (t === 'color') upScene({ background: { type: 'color', color: project.brand.background } });
            else if (t === 'gradient')
              upScene({ background: { type: 'gradient', from: project.brand.background, to: project.brand.primary, angle: 135 } });
          }}
        />
        {scene.background.type === 'color' && (
          <ColorField
            label="Colour"
            value={scene.background.color}
            onChange={(color) => upScene({ background: { type: 'color', color } }, 'bg')}
          />
        )}
        {scene.background.type === 'gradient' && (
          <>
            <ColorField
              label="From"
              value={scene.background.from}
              onChange={(from) => scene.background.type === 'gradient' && upScene({ background: { ...scene.background, from } }, 'bg')}
            />
            <ColorField
              label="To"
              value={scene.background.to}
              onChange={(to) => scene.background.type === 'gradient' && upScene({ background: { ...scene.background, to } }, 'bg')}
            />
            <NumberField
              label="Angle"
              unit="°"
              value={scene.background.angle}
              min={0}
              max={360}
              onChange={(angle) => scene.background.type === 'gradient' && upScene({ background: { ...scene.background, angle } }, 'bg')}
            />
          </>
        )}
        <SelectField
          label="Transition from previous scene"
          value={scene.transition.type}
          options={TRANSITIONS}
          onChange={(type) => upScene({ transition: { ...scene.transition, type } })}
        />
        {scene.transition.type !== 'none' && (
          <NumberField
            label="Transition length"
            unit="ms"
            value={scene.transition.durationMs}
            min={100}
            max={3000}
            step={50}
            onChange={(durationMs) => upScene({ transition: { ...scene.transition, durationMs } }, 'tr')}
          />
        )}
        <SelectField
          label="Editing mode"
          value={scene.mode}
          options={[
            { value: 'structured', label: 'Visual elements' },
            { value: 'html', label: 'Direct HTML/CSS' },
          ]}
          onChange={(mode) => upScene({ mode })}
        />
      </Section>

      {scene.mode === 'html' && (
        <Section title="HTML / CSS">
          <p className="hint">
            Scripts, forms, iframes and network requests are not supported and are removed. Animate with CSS <code>@keyframes</code>; time
            is controlled by the renderer. Reference project media as <code>asset:&lt;id&gt;</code>.
          </p>
          <TextField
            label="Scene HTML and CSS"
            value={scene.html}
            multiline
            maxLength={100000}
            onChange={(html) => upScene({ html }, 'html')}
          />
          <ul className="warnings" aria-live="polite">
            {htmlWarnings.length === 0 ? (
              <li className="ok">No unsupported features found.</li>
            ) : (
              htmlWarnings.map((w) => <li key={w}>⚠ {w}</li>)
            )}
          </ul>
        </Section>
      )}

      {scene.mode === 'structured' && element && (
        <>
          <Section title={`Element: ${element.name || element.type}`}>
            {element.type === 'text' && (
              <>
                <TextField label="Text" value={element.text} multiline maxLength={5000} onChange={(text) => upEl({ text }, 'text')} />
                <NumberField
                  label="Font size"
                  unit="% of height"
                  value={element.fontSize}
                  min={1}
                  max={40}
                  step={0.5}
                  onChange={(fontSize) => upEl({ fontSize }, 'fs')}
                />
                <NumberField
                  label="Weight"
                  value={element.fontWeight}
                  min={100}
                  max={900}
                  step={100}
                  onChange={(fontWeight) => upEl({ fontWeight }, 'fw')}
                />
                <SelectField
                  label="Font"
                  value={element.fontFamily}
                  options={FONT_FAMILIES}
                  onChange={(fontFamily) => upEl({ fontFamily })}
                />
                <SelectField
                  label="Align"
                  value={element.align}
                  options={['left', 'center', 'right'] as const}
                  onChange={(align) => upEl({ align })}
                />
                <ColorField label="Colour" value={element.color} onChange={(color) => upEl({ color }, 'color')} />
              </>
            )}
            {element.type === 'shape' && (
              <>
                <SelectField
                  label="Shape"
                  value={element.shape}
                  options={['rect', 'ellipse'] as const}
                  onChange={(shape) => upEl({ shape })}
                />
                <ColorField label="Fill" value={element.fill} onChange={(fill) => upEl({ fill }, 'fill')} />
                <NumberField
                  label="Corner radius"
                  unit="%"
                  value={element.radius}
                  min={0}
                  max={50}
                  onChange={(radius) => upEl({ radius }, 'radius')}
                />
              </>
            )}
            {element.type === 'image' && (
              <SelectField label="Fit" value={element.fit} options={['contain', 'cover'] as const} onChange={(fit) => upEl({ fit })} />
            )}
          </Section>
          <Section title="Position and size">
            <NumberField label="X (centre)" unit="%" value={element.x} min={-50} max={150} step={0.5} onChange={(x) => upEl({ x }, 'x')} />
            <NumberField label="Y (centre)" unit="%" value={element.y} min={-50} max={150} step={0.5} onChange={(y) => upEl({ y }, 'y')} />
            <NumberField
              label="Width"
              unit="% of canvas"
              value={element.w}
              min={1}
              max={200}
              step={0.5}
              onChange={(w) => upEl({ w }, 'w')}
            />
            {element.type !== 'text' && (
              <NumberField
                label="Height"
                unit="% of canvas"
                value={element.h}
                min={0.2}
                max={200}
                step={0.5}
                onChange={(h) => upEl({ h }, 'h')}
              />
            )}
            <NumberField label="Scale" value={element.scale} min={0.1} max={5} step={0.05} onChange={(scale) => upEl({ scale }, 'scale')} />
            <NumberField
              label="Rotation"
              unit="°"
              value={element.rotation}
              min={-180}
              max={180}
              onChange={(rotation) => upEl({ rotation }, 'rot')}
            />
            <NumberField
              label="Opacity"
              value={element.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(opacity) => upEl({ opacity }, 'op')}
            />
          </Section>
          <Section title="Animation">
            <SelectField
              label="Enter"
              value={element.animation.preset}
              options={ENTER_PRESETS}
              onChange={(preset) => upEl({ animation: { ...element.animation, preset } })}
            />
            <NumberField
              label="Delay"
              unit="ms"
              value={element.animation.delayMs}
              min={0}
              max={20000}
              step={50}
              onChange={(delayMs) => upEl({ animation: { ...element.animation, delayMs } }, 'ad')}
            />
            <NumberField
              label="Duration"
              unit="ms"
              value={element.animation.durationMs}
              min={50}
              max={10000}
              step={50}
              onChange={(durationMs) => upEl({ animation: { ...element.animation, durationMs } }, 'adu')}
            />
            <SelectField
              label="Easing"
              value={element.animation.easing}
              options={EASINGS}
              onChange={(easing) => upEl({ animation: { ...element.animation, easing } })}
            />
            <SelectField
              label="Exit (at scene end)"
              value={element.animation.exit}
              options={EXIT_PRESETS}
              onChange={(exit) => upEl({ animation: { ...element.animation, exit } })}
            />
          </Section>
        </>
      )}
      {scene.mode === 'structured' && !element && <p className="hint">Select an element in the Scenes panel to edit it.</p>}
    </div>
  );
}
