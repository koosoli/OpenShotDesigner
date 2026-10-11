import { describe, expect, it } from 'vitest';
import { fdxTagLineIds, parseFdxTags } from '../script/fdxTags';

const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. LIVING ROOM - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>ALEX sits with a </Text><Text TagNumber="1">ledger</Text><Text> and a </Text><Text TagNumber="2">revolver</Text><Text>.</Text></Paragraph>
    <Paragraph Type="Character"><Text TagNumber="3">ALEX</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Where did it go?</Text></Paragraph>
    <Paragraph Type="Action"><Text>He snaps the </Text><Text TagNumber="1">ledger</Text><Text> shut.</Text></Paragraph>
  </Content>
  <TagData>
    <TagCategories>
      <TagCategory Id="{c-cast}" Name="Cast Members" Number="1"/>
      <TagCategory Id="{c-props}" Name="Props" Number="5"/>
      <TagCategory Id="{c-weapons}" Name="Weapons" Number="9"/>
      <TagCategory Id="{c-wardrobe}" Name="Wardrobe" Number="6"/>
    </TagCategories>
    <TagDefinitions>
      <TagDefinition CatId="{c-props}" Id="{d-ledger}" Label="Ledger" Number="1"/>
      <TagDefinition CatId="{c-weapons}" Id="{d-gun}" Label="Revolver" Number="2"/>
      <TagDefinition CatId="{c-cast}" Id="{d-alex}" Label="ALEX" Number="3"/>
      <TagDefinition CatId="{c-wardrobe}" Id="{d-coat}" Label="Trench coat" Number="4"/>
    </TagDefinitions>
    <Tags>
      <Tag Number="1"><DefId>{d-ledger}</DefId></Tag>
      <Tag Number="2"><DefId>{d-gun}</DefId></Tag>
      <Tag Number="3"><DefId>{d-alex}</DefId></Tag>
    </Tags>
  </TagData>
</FinalDraft>`;

describe('parseFdxTags', () => {
  it('reads tagged elements, maps categories and skips cast', () => {
    const elements = parseFdxTags(FDX);
    expect(elements.map((element) => [element.category, element.name])).toEqual([
      ['prop', 'Ledger'],
      ['other', 'Revolver'],
      ['wardrobe', 'Trench coat'],
    ]);
    expect(elements[1].sourceCategory).toBe('Weapons');
    expect(elements[0].paragraphs).toEqual(['ALEX sits with a ledger and a revolver.', 'He snaps the ledger shut.']);
    expect(elements[2].paragraphs).toEqual([]);
  });

  it('returns nothing for an untagged file', () => {
    expect(parseFdxTags('<FinalDraft><Content/></FinalDraft>')).toEqual([]);
  });

  it('matches tagged paragraphs to imported lines by text', () => {
    const elements = parseFdxTags(FDX);
    const lines = [
      { id: 'l1', text: 'INT. LIVING ROOM - NIGHT' },
      { id: 'l2', text: 'ALEX sits with a ledger and a revolver.' },
      { id: 'l3', text: 'ALEX' },
      { id: 'l4', text: 'Where did it go?' },
      { id: 'l5', text: 'He snaps the ledger shut.' },
    ];
    expect(fdxTagLineIds(elements, lines)).toEqual([['l2', 'l5'], ['l2'], []]);
  });
});
