import type { PolicyDoc } from "./types";

// Policy for parents and pupils. Merged from "Greenfield School Policies vetted by Proprietress", "Payment Plan",
// "Terms and Agreements", "School Agreement Checklist" and the Procedures Act (2016), with the conflicts between
// them settled by management on 22 Nov 2026 (see .claude/skills/school-policies/SKILL.md).
export const familiesPolicy: PolicyDoc = {
  key: "families",
  title: "School Policy for Parents and Pupils",
  readers: "Parents, guardians and pupils of Greenfield School",
  version: "2026/27 draft 1",
  approvedBy: null,
  approvedOn: null,
  reviewBy: "2027-08-31",
  parts: [
    {
      id: "about",
      title: "About this policy",
      sections: [
        {
          id: "about-policy",
          title: "Who this policy is for",
          blocks: [
            {
              kind: "list",
              items: [
                "This policy applies to every pupil, parent and guardian of Greenfield School.",
                "You can read it at any time on the portal and print it. The school also keeps a printed copy.",
                "Only the school management can change this policy. When it changes, you will be asked to read and accept the new version.",
                "If something is not covered here, it needs written approval from the school management first. It is then added at the next review of the policy."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "day",
      title: "The school day",
      sections: [
        {
          id: "arriving",
          title: "Arriving and leaving",
          blocks: [
            {
              kind: "list",
              items: [
                "Pupils should be in school by 7:45 am. Pupils who arrive after 7:45 am are marked late.",
                "The gate closes for assembly at 8:00 am. A pupil who arrives after that is signed in at the front desk and joins their class.",
                "Everyone comes in and goes out through the pedestrian gate, and signs in and out.",
                "Everyone stops for a security check when asked, and must meet the entry and exit rules before the gate is opened."
              ]
            }
          ]
        },
        {
          id: "early-morning-activity",
          title: "Early morning activity",
          blocks: [
            {
              kind: "text",
              text: "From 7:15 am to 7:45 am every school day, pupils complete the early morning activity their teacher has set. It counts towards their welfare and progress, and teachers record how each pupil does."
            }
          ]
        },
        {
          id: "assembly",
          title: "Assembly",
          blocks: [
            {
              kind: "table",
              head: ["Time", "What happens"],
              rows: [
                ["7:45 – 7:52", "Morning prayer, in Muslim and Christian groups (except staff on duty)"],
                ["7:52 – 7:55", "Anthems"],
                ["7:55 – 8:00", "Announcements and a short educational message, by a pupil representative or teacher on the assembly rota"],
                ["8:00 – 8:03", "Closing, by the assembly prefect or pupil representative"],
                ["8:03 – 8:05", "Pupils march to their classes in an orderly way"]
              ],
              note: "Primary and secondary pupils hold assembly in separate places chosen by the management."
            }
          ]
        },
        {
          id: "lesson-times",
          title: "Lesson and break times",
          blocks: [
            {
              kind: "table",
              head: ["Section", "Lessons", "Break", "After school"],
              rows: [
                ["Pre-school", "8:15 am – 2:00 pm", "—", "After-school care 2:00 – 3:00 pm"],
                ["Primary", "8:15 am – 3:00 pm", "10:15 – 10:45 am", "3:10 – 4:00 pm"],
                ["Secondary", "8:15 am – 3:00 pm", "11:15 – 11:45 am", "3:10 – 4:00 pm"]
              ],
              note: "School runs Monday to Friday, except public holidays on the school calendar. On Fridays every section closes at 1:00 pm."
            }
          ]
        },
        {
          id: "extra-lessons",
          title: "Extra lessons",
          blocks: [
            {
              kind: "text",
              text: "Extra lessons and preparatory classes are compulsory. If your child must miss one, ask the Principal or Head Teacher in writing first. Permission is only given for illness or on a doctor's advice."
            }
          ]
        },
        {
          id: "school-pass",
          title: "Taking a pupil out of school (school pass)",
          blocks: [
            {
              kind: "list",
              items: [
                "Write to the school management at least one month before the day you need.",
                "In an emergency, such as illness, tell the school management straight away.",
                "Attach a doctor's report or another document that explains the reason."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "learning",
      title: "Learning and assessment",
      sections: [
        {
          id: "assessment",
          title: "How pupils are assessed",
          blocks: [
            { kind: "text", text: "Pupils are assessed on their schoolwork and on their attitude." },
            {
              kind: "table",
              head: ["Area", "What counts"],
              rows: [
                ["Academics", "Weekly assessments (subject notes, a subject test and take-home work), the mid-term test and the end-of-term examination. Class participation also counts."],
                ["Welfare", "Punctuality, social conduct and health, scored every week."]
              ]
            }
          ]
        },
        {
          id: "examinations",
          title: "Examinations",
          blocks: [
            {
              kind: "list",
              items: [
                "Behave well throughout the examination period.",
                "Sit in the class you are given and follow your usual school day around your papers.",
                "Read the instructions on every paper. If there are none, ask the invigilator.",
                "After each paper, go to the library to read for the next one or rest."
              ]
            }
          ]
        },
        {
          id: "guidance",
          title: "Guidance and counselling",
          blocks: [
            {
              kind: "list",
              items: [
                "The academic team gives extra guidance to pupils who are behind their classmates. Their progress is written in the pupil's report.",
                "The welfare team helps pupils build their social skills and with any welfare concern."
              ]
            }
          ]
        },
        {
          id: "clubs",
          title: "Clubs, quiz and debate",
          blocks: [
            {
              kind: "list",
              items: [
                "Each career and skills club is run by a teacher and a pupil representative.",
                "A quiz or a debate is held every two weeks, as set in the term calendar."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "behaviour",
      title: "Behaviour and dress",
      sections: [
        {
          id: "school-rules",
          title: "School rules",
          blocks: [
            {
              kind: "list",
              items: [
                "Come to school every day.",
                "Never take anything that does not belong to you.",
                "Speak to other pupils with a kind tone and good manners.",
                "Use British English in class. Other languages, such as French or Yoruba, are spoken in their own lessons.",
                "Be a good ambassador for the school outside it. In school uniform, never play cards, ludo or draughts in public, fight in the street or hawk. A pupil who does may be suspended or expelled, depending on how serious it is."
              ]
            }
          ]
        },
        {
          id: "dress-code",
          title: "Dress code",
          blocks: [
            {
              kind: "list",
              items: [
                "Wear the complete, neat school uniform from the start to the end of the school day.",
                "White socks and black shoes only.",
                "Skirts must reach the knee or below.",
                "Girls may wear one pair of small button earrings that do not dangle. No make-up.",
                "Wear the approved hairstyles or keep hair cut low. No attachments.",
                "No pendants, rings, amulets, other jewellery or sunglasses.",
                "Carry your school ID card at all times. Prefects wear their badges at all times."
              ]
            }
          ]
        },
        {
          id: "discipline-ladder",
          title: "When a rule is broken",
          blocks: [
            {
              kind: "text",
              text: "The school counts how many times a pupil has broken the same rule, and the correction grows each time."
            },
            {
              kind: "table",
              head: ["Time", "What it means", "Correction"],
              rows: [
                ["1st", "The pupil is new to the rule and broke it while still getting used to it.", "Reads the rule from the policy book three times, then a firm warning."],
                ["2nd", "The pupil broke the rule again after being corrected.", "One of: 30 minutes of useful work, time apart from the class, losing break time, or a spoken promise."],
                ["3rd", "The pupil is deliberately refusing correction.", "30 minutes of useful work on 3 days in a row, a one-to-one counselling session, and a written statement in the pupil's file on why it happened and how they will change."],
                ["4th", "The pupil is not responding to the school's usual corrections.", "The parent is invited to the school. Extra time with the school's environment team for days or weeks set by the disciplinary committee, or referral to a correctional service in the community."]
              ],
              note: "Taking what belongs to someone else is corrected with useful work from the first time."
            }
          ]
        },
        {
          id: "prefects",
          title: "Prefects, captains and viziers",
          blocks: [{ kind: "text", text: "Prefects, captains and viziers carry out the duties set out in the school prospectus." }]
        },
        {
          id: "pupil-government",
          title: "Pupils' government",
          blocks: [
            {
              kind: "list",
              items: [
                "Pupils elect their representatives freely and fairly, at the end of every school year.",
                "Representatives report back to pupils and to the school management in good time.",
                "Outgoing representatives hand over what the new ones need to know, with any documents."
              ]
            }
          ]
        }
      ]
    },
    {
      id: "communication",
      title: "Communication",
      sections: [
        {
          id: "how-we-contact-you",
          title: "How the school contacts you",
          blocks: [
            {
              kind: "list",
              items: [
                "The school uses the portal, email, text messages, phone calls and WhatsApp groups approved by the management.",
                "Keep your phone number and email up to date on the portal so the school can always reach you.",
                "Pupils hear school news at assembly."
              ]
            }
          ]
        },
        {
          id: "communication-book",
          title: "The communication book",
          audience: "parents",
          blocks: [
            {
              kind: "text",
              text: "Your child's year coordinator writes in the Greenfield communication book every day about your child's progress. Please sign it, add any comments and send it back the next day."
            }
          ]
        },
        {
          id: "pta",
          title: "Parent Teachers Association (PTA)",
          audience: "parents",
          blocks: [
            {
              kind: "list",
              items: [
                "The PTA helps parents and staff work together for the good of the school.",
                "Every parent who pays the termly PTA dues is a member, and so is every member of staff.",
                "The PTA meets once a term at the school. Attendance is expected and earns reward points.",
                "You are told the date at least two months before the meeting."
              ]
            }
          ]
        },
        {
          id: "event-reminders",
          title: "Event dates and reminders",
          audience: "parents",
          blocks: [
            {
              kind: "table",
              head: ["When", "What you receive"],
              rows: [
                ["2 months before", "The date of the event"],
                ["1 month before", "A reminder"],
                ["1 week before", "A reminder"],
                ["2 days before", "A final reminder"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "events",
      title: "Events in the school year",
      sections: [
        {
          id: "events-list",
          title: "School events",
          blocks: [
            {
              kind: "table",
              head: ["Event", "When"],
              rows: [
                ["Early morning activity, assembly and lessons", "Every school day"],
                ["Quiz or debate", "Every two weeks"],
                ["PTA meeting", "Every term"],
                ["Open day", "Every mid-term"],
                ["Mid-term and end-of-term examinations", "Every term"],
                ["End of year party", "End of first term"],
                ["Inter-house sports", "Second term, every two years"],
                ["End of session party", "Third term"],
                ["Junior and senior WAEC, NECO and other external examinations", "As set by the examining bodies"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "admission",
      title: "Admission and leaving",
      sections: [
        {
          id: "admission-documents",
          title: "Documents needed for admission",
          audience: "parents",
          blocks: [
            {
              kind: "steps",
              items: [
                "Admission form",
                "Entrance examination result",
                "Previous school result or certificate (where there is one)",
                "Birth certificate",
                "Medical report",
                "Bio data form",
                "Signed copy of this school policy",
                "Signed Terms and Agreements"
              ]
            },
            {
              kind: "text",
              text: "By signing the Terms and Agreements, the parent, the pupil and the school confirm that the documents above have been handed in and that the parent has read, accepted and received this policy."
            }
          ]
        },
        {
          id: "admission-ages",
          title: "Age and other requirements",
          audience: "parents",
          blocks: [
            {
              kind: "table",
              head: ["Section", "Age at admission", "Also needed"],
              rows: [
                ["Pre-school", "1 to 5 years", "—"],
                ["Primary", "6 to 11 years", "—"],
                ["Junior secondary", "10 to 13 years", "Transfer certificate, if moving from another school"],
                ["Senior secondary", "—", "Junior WAEC (BECE) certificate, and a transfer certificate if moving from another school"]
              ],
              note: "The Head Teacher or Principal may admit a pupil outside these ages after an assessment, and records why."
            }
          ]
        },
        {
          id: "withdrawal",
          title: "Withdrawing a pupil",
          audience: "parents",
          blocks: [
            {
              kind: "text",
              text: "Give the school written notice, with your reasons, one full term before your child leaves. If you cannot, one term's fees are payable instead of the notice."
            }
          ]
        }
      ]
    },
    {
      id: "fees",
      title: "Fees and payment plans",
      sections: [
        {
          id: "when-to-pay",
          title: "When to pay",
          audience: "parents",
          blocks: [
            {
              kind: "list",
              items: [
                "New pupils: pay the full fees before your child's first day.",
                "Returning pupils: pay the full fees by the end of the second week of term, or follow a payment plan you have signed with the school.",
                "The damage (caution) fee is paid with the school fees once every session.",
                "Buy your child's textbooks before or on the first day of term. A pupil cannot start lessons without them."
              ]
            }
          ]
        },
        {
          id: "early-payment",
          title: "Discounts for paying early",
          audience: "parents",
          blocks: [
            {
              kind: "table",
              head: ["Pay in full", "Discount on tuition"],
              rows: [
                ["Two sessions in advance", "15%"],
                ["One session in advance", "10%"],
                ["One term in advance", "7%"],
                ["At least two weeks before the term starts", "5%"]
              ],
              note: "Discounts are on tuition only, not on other fees. The school adds the discount to your invoice once your payment has arrived in time. They don't apply to fees on a payment plan."
            }
          ]
        },
        {
          id: "payment-plans",
          title: "Payment plans",
          audience: "parents",
          blocks: [
            {
              kind: "text",
              text: "If you cannot pay the term's fees at once, choose one of these plans. This is your School Fees Payment Agreement. Choose it on the portal (under Fees & billing, by typing your full name) up to the first day of term, or sign it at the school office."
            },
            {
              kind: "table",
              head: ["Plan", "By the first day", "Then"],
              rows: [
                ["2 payments", "55%", "45% by week 5"],
                ["3 payments", "40%", "30% by week 4, 30% by week 8"],
                ["4 payments", "30%", "30% by week 4, 20% by week 7, 20% by week 10"],
                ["5 payments", "25%", "20% by week 4, 20% by week 7, 20% by week 10, 15% before collecting the report card"]
              ],
              note: "Percentages are of the term's total fees. \"By week 4\" means by Friday of the fourth week of term (week 1 is the week the term starts). The last payment of the 5-payment plan is due on the last day of term."
            }
          ]
        },
        {
          id: "late-payment",
          title: "Missed payments",
          audience: "parents",
          blocks: [
            {
              kind: "text",
              text: "If a payment in your plan is missed, or the agreement is broken, a default fee is added: ₦2,500 or 3% of the term's school fees, whichever is higher, for each missed payment. The school checks its records first, then tells you on the portal and by email and sends a default letter. The fee is paid with your next payment."
            }
          ]
        }
      ]
    },
    {
      id: "rewards",
      title: "Rewards and scholarships",
      sections: [
        {
          id: "pupil-awards",
          title: "Awards for pupils",
          blocks: [
            {
              kind: "list",
              items: [
                "Pupils are given awards for outstanding work at the school's award events.",
                "Bring any award your child wins outside school to the school management. It is recorded and recognised, to encourage other pupils."
              ]
            }
          ]
        },
        {
          id: "entrance-scholarship",
          title: "Entrance examination scholarships",
          audience: "parents",
          blocks: [
            {
              kind: "table",
              head: ["Entrance examination score", "Tuition scholarship"],
              rows: [
                ["Above 80%", "5%"],
                ["100%", "10%"]
              ]
            }
          ]
        },
        {
          id: "parent-points",
          title: "Reward points for parents",
          audience: "parents",
          blocks: [
            {
              kind: "table",
              head: ["You earn", "Points"],
              rows: [
                ["Each PTA meeting you attend", "100"],
                ["Each new pupil admitted with your reference number", "200"]
              ]
            },
            {
              kind: "table",
              head: ["Points", "Reward"],
              rows: [
                ["1,000", "5% off tuition"],
                ["2,000", "10% off tuition"],
                ["5,000", "Half-tuition scholarship"]
              ],
              note: "Points are used up when you take a reward. Points can also be given for your child's academic results and good conduct."
            },
            {
              kind: "table",
              head: ["Your child has been at the school for", "You become"],
              rows: [
                ["3 sessions", "A leader"],
                ["5 sessions", "A veteran"],
                ["10 sessions", "A patron"]
              ]
            }
          ]
        },
        {
          id: "scholarship-grades",
          title: "Scholarship grades",
          audience: "parents",
          blocks: [
            {
              kind: "text",
              text: "When a pupil is admitted, the school places them in a fee grade. The grade sets how much of the tuition is paid. Other fees, such as the caution fee and textbooks, are paid in full."
            },
            {
              kind: "table",
              head: ["Grade", "Tuition paid", "Access"],
              rows: [
                ["Grade 1", "100%", "All special packages and equipment"],
                ["Grade 2", "75%", "Selected packages"],
                ["Grade 3", "50%", "Selected packages"],
                ["Grade 4", "25%", "Selected packages"],
                ["Grade 5", "0%", "Selected packages"]
              ]
            }
          ]
        }
      ]
    }
  ]
};
